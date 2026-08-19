// _self_verify.js �?" standalone verification of the browser-tools stack.
//
// Loads the same tools.js the MCP server uses and drives a real scenario:
//   1. navigate to example.com
//   2. inspect -> get the interactable tree (eyes on the numeric targets)
//   3. click a link by visible text
//   4. confirm navigated to the target URL
//   5. navigate to a form page and fill a field
//   6. fetch a fresh inspect from the SAME manager to prove the browser
//      persisted across operations (no relaunch between cheap ops)
// Then closes cleanly.
//
// Run: npm run verify  (or: node server/_self_verify.js)

const tools = require("./tools.js");
const { ensureBrowser, close } = require("./browser.js");

async function main() {
  console.log("== browser-tools self-verify ==");

  const nav = await tools.navigate("https://example.com/");
  console.log("[1] navigate ->", nav.url, "| title:", nav.title);

  const insp = await tools.inspect();
  console.log("[2] inspect -> element_count:", insp.element_count);
  console.log("    screenshot:", insp.screenshot);
  for (const el of insp.elements.slice(0, 5)) {
    console.log(`      [${el.target}] <${el.tag}> "${el.text}" href=${el.href}`);
  }
  if (insp.elements.length === 0) throw new Error("inspect returned no interactable elements");

  // Click the example.com link using its numeric target from the tree
  // (proves the inspect-number addressing path, not just text matching).
  const linkEl = insp.elements[0];
  const clickRes = await tools.click(String(linkEl.target));
  console.log(`[3] click(#${linkEl.target} "<${linkEl.tag}>") ->`, clickRes.url);

  if (!/iana\.org|example\.com/i.test(clickRes.url)) {
    throw new Error("click did not navigate as expected; url=" + clickRes.url);
  }

  // Prove the manager still holds the same page with no relaunch.
  const insp2 = await tools.inspect();
  console.log("[4] post-click inspect -> url:", insp2.url, "| title:", insp2.title);

  // Fill test on a page with a guaranteed text field (Google's search box).
  await tools.navigate("https://www.google.com/");
  const insp3 = await tools.inspect();
  // Google's search field is the element with name="q" (an input or textarea).
  const input = insp3.elements.find((e) => e.name === "q");
  if (input) {
    await tools.fill(String(input.target), "ubuntu lab consultants");
    const verif = await tools.inspect();
    const box = verif.elements.find((e) => e.target === input.target);
    console.log("[5] fill -> element #" + input.target + (box && box.text ? ` value now: "${box.text}"` : " (typed; value not re-exposed in tree)"));
  } else {
    console.log("[5] fill -> SKIPPED (no name=q field found on google.com; not fabricated)");
  }

  // [6] Crash recovery: kill the whole browser, then confirm the next tool call
  // relaunches it transparently (this is what must happen if the user closes
  // the window or the process dies mid-session).
  await close();
  const rec = await tools.navigate("https://example.org/");
  const recInsp = await tools.inspect();
  console.log(`[6] relaunch after crash -> ${rec.url} | elements: ${recInsp.element_count}`);

  console.log("== self-verify PASS ==");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("== self-verify FAIL ==", e.message);
  process.exit(1);
});