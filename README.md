# Claude Usage Bar

See your Claude.ai usage, your 5-hour session and weekly all-models limits, in a
slim bar under the chat. No sign-in needed.

Claude Usage Bar shows how much of your Claude.ai usage you have left, right under
the chat box, so a limit never catches you off guard mid-conversation.

It puts small bars under the message box for your current 5-hour session usage and
your weekly all-models usage. If your plan has a separate Opus allowance, that
appears too. Each bar is color-coded, blue when you are under 30%, orange from 30%
to 80%, and red above 80%, and it shows a countdown to when the limit resets.

There is nothing to set up. No tokens, no API keys, and no extra sign-in. As long as
you are logged in to Claude, it just works, because it reads your usage straight from
Claude using the session already in your browser. Everything stays on your device and
nothing is sent to any server.

You can pick which bars show, turn the bar on or off with a keyboard shortcut, and
open a small popup for the same numbers with a one-click refresh.

Your privacy is respected. The extension only talks to claude.ai and keeps your
numbers in your local browser storage. It never reads your conversations and never
sends your data anywhere.

This extension is not affiliated with, endorsed by, or sponsored by Anthropic. Claude
is a trademark of Anthropic PBC. It relies on undocumented Claude features that can
change over time.

## How it works

It reads your usage from Claude's own internal endpoints using the login session
already in your browser:

- `GET /api/organizations` → finds your chat org (probes each org and locks onto
  the one with real usage; cached)
- `GET /api/organizations/{id}/usage` → `five_hour`, `seven_day`, `seven_day_opus`

The numbers refresh every five minutes in the background, so the toolbar badge and
the popup are current even when no claude.ai tab is open. When a claude.ai tab is
open the extension asks that tab to do the fetch; otherwise it calls the endpoint
itself. An open, visible tab also refreshes its own bar every minute.

Everything stays on your machine (`chrome.storage.local`). Nothing is sent to any
third-party server.

## Install (unpacked)

1. Go to `chrome://extensions`.
2. Turn on Developer mode (top right).
3. Click Load unpacked and select the folder containing `manifest.json`.
4. Open or refresh claude.ai.

Works on any Chromium browser (Chrome, Edge, Brave, Arc, Opera).

## Using it

- Click the toolbar icon for the popup: your usage readout, "Show in bar"
  (Session / All models), a Refresh button, and a Settings button.
- Everything else lives on the Settings page (the Settings button, or right-click
  the icon → Options):
  - Master on/off for the bar.
  - Design 1 or Design 2: the full bar under the chat, or a compact widget tucked
    into the composer toolbar. Design 1 is the default.
  - Toolbar-icon badge: a colored usage number on the extension icon so you can
    read it at a glance. Off by default; when on, choose whether it shows your
    session (5h), weekly all-models (7d), or the higher of the two.
  - Account switch (for multi-org accounts) and "Use automatic" to undo it.
  - The show or hide hotkey.
- Hotkey to show or hide the bar: `Ctrl/Cmd + Shift + U`. Rebind at
  `chrome://extensions/shortcuts`.
- If the bar ever shows 0% on a multi-org account, open Settings → Change → pick
  the account with your real usage.

## Permissions

- `storage`: saves your preferences and the last-seen numbers, locally.
- host `https://claude.ai/*`: calls the usage endpoint with your existing session.
- `alarms`: refreshes the numbers every five minutes so they are not stale.
- `commands`: the show or hide keyboard shortcut.

## Publishing to the Chrome Web Store

The code is Manifest V3 and ships no remote code, so it meets the core store
requirements. Before submitting:

1. Add a privacy policy URL. It can be short: the extension reads your Claude
   usage via claude.ai, stores it only in local browser storage, and sends nothing
   to any external server.
2. Provide listing assets: the 128px icon (included), at least one screenshot
   (1280×800 or 640×400), and a short and detailed description.
3. Fill the permission justifications (see Permissions above) in the dashboard.
4. Disclose that it relies on undocumented claude.ai endpoints that can change.
5. Naming/trademark: the store may flag a name that implies official affiliation.
   Consider a name like "Usage Bar for Claude"; the included "not affiliated"
   note helps. Edit the copyright holder in `LICENSE`.

## Caveats

These endpoints are undocumented and not officially supported by Anthropic. If
Claude changes them, the bar may show `–` or `!` until updated.

## License

MIT license, see `LICENSE`.
