// Smoke test: launch the server over stdio, call tools/list, assert tool names.
//
// Listing tools never launches the browser (that happens on first navigate),
// so this runs headless-safe in CI. The headed end-to-end scenario lives in
// server/_self_verify.js (`npm run verify`, needs a display + network).
//
// Run: node test/smoke.mjs  (exit 0 = pass)
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED = [
  "browser_navigate",
  "browser_inspect",
  "browser_click",
  "browser_fill",
  "browser_request_human",
];

async function main() {
  const serverPath = path.join(import.meta.dirname, "..", "server", "server.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });
  const client = new Client({ name: "smoke-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    console.log("tools/list ->", names.join(", "));
    const missing = EXPECTED.filter((n) => !names.includes(n));
    if (missing.length) throw new Error("missing tools: " + missing.join(", "));
    console.log("smoke PASS");
  } finally {
    await client.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("smoke FAIL:", e.message);
    process.exit(1);
  }
);
