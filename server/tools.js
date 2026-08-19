// tools.js �?" the five browser operations used by server.js.
//
// Element targeting follows the Claude Code browser-tool convention: every
// interactable element gets a numeric target ID from browser_inspect, and
// click/fill can address it by that number OR by a CSS selector OR by visible
// text. Highlights the element briefly before clicking so the user sees what
// happened.

const path = require("path");
const fs = require("fs");
const { ensureBrowser } = require("./browser");

const SHOTS_DIR = path.join(__dirname, "..", "shots");
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

// Elements we consider clickable/fillable for the interactable tree.
const INTERACTABLE =
  'a[href], button, input:not([type=hidden]), textarea, select, ' +
  '[role=button], [role=link], [role=tab], [role=checkbox], [role=radio], ' +
  '[role=menuitem], [role=option], [contenteditable=true]';

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// Build the interactable element tree with numeric targets. Evaluating in the
// page keeps the assertion about "observed" elements honest. Each element also
// gets a data-bt-target attribute so click/fill can resolve the EXACT same
// element later — numeric targets computed on a visible-filtered tree would
// drift against an unfiltered .nth() on pages with hidden inputs.
async function buildElementTree(page) {
  const nodes = await page.evaluate((sel) => {
    const firstDefined = (...vals) => {
      for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };
    for (const el of document.querySelectorAll("[data-bt-target]")) {
      el.removeAttribute("data-bt-target");
    }
    const els = Array.from(document.querySelectorAll(sel));
    const out = [];
    let k = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden/not laid out
      const tag = el.tagName.toLowerCase();
      const labelText = firstDefined(
        el.getAttribute("aria-label"),
        el.getAttribute("data-testid"),
        el.getAttribute("name"),
        el.textContent,
        el.getAttribute("value"),
        el.getAttribute("placeholder")
      );
      const href = el.getAttribute && el.getAttribute("href");
      el.setAttribute("data-bt-target", String(k));
      out.push({
        target: k,
        tag,
        type: el.getAttribute && el.getAttribute("type") || "",
        text: labelText.slice(0, 80),
        href: href && href !== "#" && !href.startsWith("javascript:") ? href : "",
        placeholder: (el.getAttribute && el.getAttribute("placeholder")) || "",
        name: (el.getAttribute && el.getAttribute("name")) || "",
      });
      k++;
    }
    return out;
  }, INTERACTABLE);
  return nodes;
}

// Resolve a click/fill target given page state. target can be:
//   a number "3"          -> the 3rd interactable element from the tree
//   a string starting #/. -> treated as a CSS selector
//   anything else         -> treated as visible text to match
async function resolveElement(page, target) {
  if (target === undefined || target === null || String(target).trim() === "") {
    throw new Error("A target is required: an element number, CSS selector, or visible text.");
  }
  const t = String(target).trim();

  // Numeric target -> resolve against a fresh tree via the stable tag we set.
  if (/^\d+$/.test(t)) {
    const tree = await buildElementTree(page);
    const idx = parseInt(t, 10);
    const node = tree.find((n) => n.target === idx);
    if (!node) {
      const hint = tree.slice(0, 200).map((n) => `  [${n.target}] ${n.tag} "${n.text}"`).join("\n");
      throw new Error(`No interactable element #${t}. Known targets:\n${hint || "  (none)"}`);
    }
    return { kind: "attr", value: `[data-bt-target="${idx}"]`, index: null };
  }

  // CSS selector.
  if (t.startsWith("#") || t.startsWith(".") || t.includes("[") || t.includes(">") || t.includes(" ")) {
    return { kind: "css", value: t, index: null };
  }

  // Visible text.
  return { kind: "text", value: t, index: null };
}

async function locate(page, res) {
  if (res.kind === "text") {
    const loc = page.getByText(res.value, { exact: false }).first();
    const count = await loc.count();
    if (count === 0) throw new Error(`No element with text "${res.value}".`);
    return loc;
  }
  if (res.index !== null) {
    // nth() is 0-based; target index is 0-based already.
    return page.locator(res.value).nth(res.index);
  }
  return page.locator(res.value).first();
}

// Temporarily outline an element so the user sees what's about to be clicked.
async function highlight(page, loc) {
  try {
    await loc.evaluate((el) => {
      el.style.outline = "3px solid rgba(255,140,0,0.9)";
      el.style.transition = "none";
    });
    await page.waitForTimeout(150);
  } catch (_) {
    // element already gone; the click will surface the real error
  }
}

async function screenshot(page, name) {
  const file = path.join(SHOTS_DIR, `${name || "shot"}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// ---- public operations -----------------------------------------------------

async function navigate(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");
  const page = await ensureBrowser();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  return {
    url: page.url(),
    title: await page.title(),
  };
}

async function inspect() {
  const page = await ensureBrowser();
  const tree = await buildElementTree(page);
  const shot = await screenshot(page, "inspect_" + Date.now());
  return {
    url: page.url(),
    title: await page.title(),
    element_count: tree.length,
    elements: tree,
    screenshot: shot,
  };
}

async function click(target) {
  const page = await ensureBrowser();
  const res = await resolveElement(page, target);
  const loc = await locate(page, res);
  await highlight(page, loc);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click();
  await page.waitForTimeout(250);
  return { clicked: target, url: page.url(), title: await page.title() };
}

async function fill(target, value) {
  const page = await ensureBrowser();
  const res = await resolveElement(page, target);
  // For text values, prefer a form field (input/textarea); fall back to any match.
  const loc = await locate(page, res);
  await highlight(page, loc);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.fill(String(value));
  await page.waitForTimeout(150);
  return { filled: target, with_value: String(value) };
}

async function requestHuman(message) {
  const page = await ensureBrowser();
  return {
    status: "awaiting_human",
    message: String(message || ""),
    hint:
      "Pause the agent's flow and surface this to the human now. Do not continue " +
      "automated steps until they have answered.",
    url: page.url(),
    title: await page.title(),
  };
}

module.exports = { navigate, inspect, click, fill, requestHuman, SHOTS_DIR };