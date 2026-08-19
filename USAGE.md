# browser-tools — usage rules for agents

A persistent, **headed** Chromium browser controlled through the
`browser-tools` MCP server (built 2026-08-05). This is the Claude-Code-style
browser tool OpenCode lacked.

## Tools

- `browser_navigate(url)` — load a page; returns final URL + title.
- `browser_inspect()` — screenshot + interactable element tree. **Call this
  before click/fill.** Every element carries a numeric `target`; address it by
  that number, or by CSS selector, or by visible text.
- `browser_click(target)` — highlights the element briefly, then clicks.
- `browser_fill(target, value)` — types into a text field.
- `browser_request_human(message)` — **stop automation and surface this to the
  human; resume only after they answer.**

## What it is / isn't

- Headless:false, slowMo:100, viewport 1280x800, desktop Chrome UA. A real
  window opens on the desktop so the user can watch every action.
- **A FRESH, isolated browser** — not Luigi's logged-in Chrome (that's
  `chrome-bridge`). No logged-in sessions carry over, no extensions.
- The MCP process holds the browser, so it survives across agent turns and
  relaunches itself if it crashes or the window is closed.

## Hard rules

1. **Inspect before you act.** Guess a selector once, confirm against
   `browser_inspect`, then act. If a click/fill fails, re-inspect and retry —
   sites re-render and numeric targets shift.
2. **Never log in, sign up, or place an order** without an explicit human
   instruction. Read/click/fill for research is fine; anything that commits
   money, an account, or sends something is human-gated.
3. **browser_request_human means STOP.** Do not chain automated steps after
   it. Surface the question, wait for the answer.
4. **Screenshots** land in `C:\Dev\browser-tools-mcp\shots\` — stat them after
   `browser_inspect` if the run needs them verified.
5. **Headed browser needs a desktop.** If the machine has no interactive
   session the launch will fail — report that rather than pretending.

## Interop

- Reading X/LinkedIn/Reddit behind login: use `chrome-bridge` (logged-in
  Chrome), not browser-tools.
- Composing/sending email: `gmail-draft` (drafts) / `email-engine` (send,
  human-authorised only). browser-tools can drive a webmail UI, but that is
  the last resort and sending still needs Luigi's sign-off.
