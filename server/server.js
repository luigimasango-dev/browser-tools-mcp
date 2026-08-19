// server.js �?" browser-tools MCP server entrypoint (stdio).
//
// Exposes a persistent, headed Playwright browser to OpenCode/Claude Code as
// five tools: browser_navigate, browser_click, browser_fill, browser_inspect,
// browser_request_human. The MCP process is the singleton browser manager: it
// stays alive for the whole CLI session, so the browser survives across agent
// turns and is transparently relaunched on crash. Schemas are auto-registered
// into the model's tool list by MCP discovery.
//
// NOTE on browser_request_human: in a stdio MCP server stdin is the JSON-RPC
// framing, not the user's terminal, so we cannot synchronously block reading
// input. Instead the tool returns a structured "awaiting_human" response that
// instructs the model to stop automation, surface the question to the human,
// and resume only after an answer.

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const core = require("./browser.js");
const tools = require("./tools.js");

const server = new McpServer({
  name: "browser-tools",
  version: "1.0.0",
  instructions:
    "A persistent, headed Chromium browser you control like Claude Code's browser tool. " +
    "Use browser_inspect to page through a page's interactable elements (they carry " +
    "numeric targets), then browser_click / browser_fill by that number, a CSS selector, " +
    "or visible text. browser_navigate loads a URL. Prefer browser_inspect over guessing a " +
    "selector. If a login is required or a real decision is needed, call browser_request_human " +
    "and stop until the human answers."
});

function ok(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
function err(e) {
  return {
    content: [{ type: "text", text: "ERROR: " + e.message }],
    isError: true,
  };
}

server.tool(
  "browser_navigate",
  "Open a URL in the persistent browser and wait for the page to load. Returns the final URL and page title.",
  { url: z.string().describe("Full URL (http/https) to navigate to") },
  async ({ url }) => {
    try { return ok(await tools.navigate(url)); } catch (e) { return err(e); }
  }
);

server.tool(
  "browser_inspect",
  "Screenshot the current page and list its interactable elements with numeric targets, " +
  "so you can click or fill by number. Use this before click/fill rather than guessing."
, {},
  async () => {
    try { return ok(await tools.inspect()); } catch (e) { return err(e); }
  }
);

server.tool(
  "browser_click",
  "Click an element. target can be the numeric target from browser_inspect, a CSS selector, " +
  "or visible text. Highlights the element briefly before clicking.",
  { target: z.string().describe("Element target: inspect number, CSS selector, or visible text") },
  async ({ target }) => {
    try { return ok(await tools.click(target)); } catch (e) { return err(e); }
  }
);

server.tool(
  "browser_fill",
  "Type a value into a text field. target can be the numeric target from browser_inspect, " +
  "a CSS selector, or visible text.",
  {
    target: z.string().describe("Field target: inspect number, CSS selector, or visible text"),
    value: z.string().describe("Value to type"),
  },
  async ({ target, value }) => {
    try { return ok(await tools.fill(target, value)); } catch (e) { return err(e); }
  }
);

server.tool(
  "browser_request_human",
  "Pause the flow and ask the human a question. Returns awaiting_human; the model must stop " +
  "automation and surface this to the user, then resume only after they answer.",
  { message: z.string().describe("Question or instruction to put to the human") },
  async ({ message }) => {
    try { return ok(await tools.requestHuman(message)); } catch (e) { return err(e); }
  }
);

// Shut the browser down cleanly when the host goes away.
process.on("SIGINT", async () => { await core.close(); process.exit(0); });
process.on("SIGTERM", async () => { await core.close(); process.exit(0); });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((e) => {
  console.error("[browser-tools] fatal:", e.message);
  process.exit(1);
});