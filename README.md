# Claude Usage Bar

A small Chrome/Chromium extension that shows your Claude.ai usage limits in a slim
bar right under the chat composer — so you can see how close you are without
opening the settings page.

- Session (5h) — your current rolling-window usage
- All models (7d) — your weekly cap across all models
- Opus (7d) — shown only if your plan has a separate Opus allowance

Bars are color-coded: blue under 30%, Claude orange 30–80%, red above 80%, each
with a "resets in …" countdown. No tokens, no sign-in, no setup — if you're logged
into Claude, it just works.

## How it works

It reads your usage from Claude's own internal endpoints using the login session
already in your browser:

- `GET /api/organizations` → finds your chat org (probes each org and locks onto
  the one with real usage; cached)
- `GET /api/organizations/{id}/usage` → `five_hour`, `seven_day`, `seven_day_opus`

Everything stays on your machine (`chrome.storage.local`). Nothing is sent to any
third-party server.

## Install (unpacked)

1. Go to `chrome://extensions`.
2. Turn on Developer mode (top right).
3. Click Load unpacked and select the folder containing `manifest.json`.
4. Open or refresh claude.ai.

Works on any Chromium browser (Chrome, Edge, Brave, Arc, Opera).

## Using it

- Click the toolbar icon for the popup: master on/off, "Show in bar" (Session /
  All models), account switch, and the hotkey.
- Hotkey to show/hide the bar: `Ctrl/Cmd + Shift + U`. Rebind at
  `chrome://extensions/shortcuts`.
- If the bar ever shows 0% on a multi-org account, open the popup → change → pick
  the account with your real usage.

## Permissions

- `storage` — save your preferences and the last-seen numbers, locally.
- host `https://claude.ai/*` — call the usage endpoint with your existing session.
- `commands` — the show/hide keyboard shortcut.

## Publishing to the Chrome Web Store

The code is Manifest V3 and ships no remote code, so it meets the core store
requirements. Before submitting:

1. Add a privacy policy URL. It can be short: the extension reads your Claude
   usage via claude.ai, stores it only in local browser storage, and sends nothing
   to any external server.
2. Provide listing assets: the 128px icon (included), at least one screenshot
   (1280×800 or 640×400), and a short + detailed description.
3. Fill the permission justifications (see Permissions above) in the dashboard.
4. Disclose that it relies on undocumented claude.ai endpoints that can change.
5. Naming/trademark: the store may flag a name that implies official affiliation.
   Consider a name like "Usage Bar for Claude"; the included "not affiliated"
   note helps. Edit the copyright holder in `LICENSE`.

## Caveats

- These endpoints are undocumented and not officially supported by Anthropic. If
  Claude changes them, the bar may show `–` or `!` until updated.
- Not affiliated with, endorsed by, or sponsored by Anthropic. "Claude" is a
  trademark of Anthropic PBC.

## License

MIT — see `LICENSE`.
