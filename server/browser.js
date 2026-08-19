// browser.js �?" singleton Playwright browser manager.
//
// Holds ONE headed Chromium instance for the life of the MCP server process,
// so the browser survives across agent turns within a CLI session. If the
// browser crashes or the page closes, the next tool call transparently
// relaunches. Launch config follows the Claude Code browser-tool spec:
// headless:false (watchable), slowMo:100 (visible actions), 1280x800 viewport,
// desktop Chrome user agent.

const { chromium } = require("playwright");

const LAUNCH_OPTS = {
  headless: false,
  slowMo: 100,
  args: ["--disable-blink-features=AutomationControlled"],
};

const CONTEXT_OPTS = {
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  locale: "en-ZA",
};

const NAV_TIMEOUT = 30000;
const ACTION_TIMEOUT = 15000;

let browser = null;
let context = null;
let page = null;

async function ensureBrowser() {
  const alive = browser && browser.isConnected && browser.isConnected();
  if (!alive) {
    if (browser) {
      try { await browser.close().catch(() => {}); } catch (_) {}
      browser = null;
    }
    browser = await chromium.launch(LAUNCH_OPTS);
    context = null;
    page = null;
  }
  if (!context || !context.pages || context.pages().length === 0) {
    context = await browser.newContext(CONTEXT_OPTS);
    page = null;
  }
  if (!page || page.isClosed()) {
    page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  }
  return page;
}

// When the user closes the window mid-session, the ensureBrowser guards
// (isConnected / isClosed) clear stale state and relaunch on the next call.

async function close() {
  if (browser) {
    try { await browser.close().catch(() => {}); } catch (_) {}
  }
  browser = null;
  context = null;
  page = null;
}

module.exports = { ensureBrowser, close, NAV_TIMEOUT, ACTION_TIMEOUT };
