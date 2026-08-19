# browser-tools-mcp

Persistent, **headed** Chromium browser control for OpenCode/Claude Code, in the
style of Claude Code's browser tool. Built 2026-08-05 because OpenCode had no
native browser tool and `custom-scraper` (plain HTTP) can't read JS-heavy or
login-walled pages.

## Architecture

The MCP server process **is** the singleton browser manager. Because OpenCode
keeps the stdio server alive for the whole CLI session, the browser survives
across agent turns. If the browser crashes or the window is closed, the next
tool call transparently relaunches it (`server/browser.js`).

Launch config: `headless: false`, `slowMo: 100`, viewport `1280x800`, desktop
Chrome UA, `--disable-blink-features=AutomationControlled`.

## Files

- `server/server.js` — MCP entrypoint, registers the five tools + schemas.
- `server/browser.js` — singleton browser/context/page manager + relaunch logic.
- `server/tools.js` — the operations (interactable tree, targeting, highlight,
  screenshots).
- `server/_self_verify.js` — standalone scenario test: `npm run verify`.
- `shots/` — screenshots from `browser_inspect`.
- `USAGE.md` — agent-facing rules (wired into OpenCode `instructions`).

## Tools

| Tool | Purpose |
|---|---|
| `browser_navigate(url)` | Load a URL; returns final URL + title. |
| `browser_inspect()` | Screenshot + interactable element tree with numeric targets. |
| `browser_click(target)` | Click by inspect number, CSS selector, or visible text. |
| `browser_fill(target, value)` | Type into a field by number/selector/text. |
| `browser_request_human(message)` | Pause flow and surface a question to the human. |

Element targeting matches the Claude Code convention: `browser_inspect` assigns
each interactable element a numeric `target`, tagged in the DOM as
`data-bt-target` so later actions resolve the exact same element (visible-
filtered indices would drift against unfiltered `.nth()` on pages with hidden
inputs). Elements are highlighted briefly before clicking so the user sees the
action.

## Verification

```
npm run verify        # navigate -> inspect -> click -> fill -> crash-recovery
```

Verified 2026-08-05: example.com navigate/inspect/click, Google fill by target,
and relaunch-after-kill all pass; all five tools registered and responded over
the real MCP stdio protocol.

## Operational notes

- **Headed means a desktop.** The Chromium window needs an interactive session
  to launch; on a headless/disconnected box the launch fails — report that
  rather than pretending.
- **Isolated browser.** This is NOT Luigi's logged-in Chrome (that's
  `chrome-bridge`). No logged-in sessions, no extensions, full write access.
- **Human-gated.** No logins/orders/sends without explicit instruction;
  `browser_request_human` means STOP until the human answers.
- Registered in `~/.config/opencode/opencode.jsonc` as the `browser-tools` MCP
  server; usage rules wired into `instructions` via `USAGE.md`.
