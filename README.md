# Firefox Control

A small local CLI, native-messaging companion, and Firefox extension for programmatic browser control. No runtime dependencies, cloud service, HTTP control port, telemetry, or AI model required.

Requires Firefox **153+** and Node.js **22+** on macOS or Linux. Windows is not supported by the companion installer.

Current components: companion **0.2.0**, extension **0.2.0**. [Download the latest release](https://github.com/Anveio/firefox-control/releases/latest). Extension 0.1.0 was submitted for public Mozilla review; 0.2.0 adds development reload support and is available as a source/development release. Until signing completes, development installation uses `about:debugging` → Load Temporary Add-on → `extension/manifest.json` and lasts until Firefox restarts.

## Install

1. Download and unpack the companion release, or clone this repository.
2. Run `node cli/firefox-control.mjs install`. Ensure `~/.local/bin` is on PATH.
3. Install the signed extension from the release or Mozilla listing.
4. Click the extension icon to enable local control and grant user-script permission. Click again to pause. `ON` indicates control is enabled; `!` indicates the native companion is unavailable.
5. Run `firefox-control profiles`, then `firefox-control --help`.

The installer registers one native host for this OS user. Only this extension's exact ID may connect. The companion exposes an owner-only Unix socket per Firefox profile in an owner-only directory. It is started by Firefox, not a background system service. Other processes running as your OS user can issue commands; keep that account and any automation agents trusted. The installer does not change Firefox security preferences.

## Examples

```sh
firefox-control profiles
firefox-control profile rename default-release --profile PROFILE_ID
firefox-control windows list
firefox-control tabs create '{"url":"https://example.com"}'
firefox-control frames 42
firefox-control snapshot 42 --frame 0
firefox-control query 42 'button'
firefox-control fill 42 '#search' 'hello'
firefox-control click 42 'button[type=submit]'
firefox-control eval 42 'return {title: document.title, links: document.links.length}'
firefox-control eval 42 --file script.js --frame 9
firefox-control console start 42
firefox-control console read 42
firefox-control screenshot 42 --out /tmp/page.png
```

Use `--profile` when multiple profiles are connected. Profile IDs are extension-generated UUIDs; rename only after matching the browser context. Container-aware tab creation uses the exact `cookieStoreId` from `firefox-control containers`. No container is selected implicitly.

`eval` is an explicit one-shot user-script install-and-run command. It accepts an async function body and returns the value supplied with `return`. The last 50 script sources are retained in extension-local storage for inspection and removal through `scripts list/delete` or the extension Preferences page. Saved scripts are tied to the selected frame's origin and never automatically run on page load. They cannot execute against extension/browser internals or communicate with the native host. Do not put secrets in script source unless you intend to store them locally until removed.

The tool transfers requested tab metadata, page content, screenshots and console output to the local companion. It does not send those results to a remote service. A program invoking the CLI may have its own data practices. User scripts may access the web under normal page/browser rules. See [PRIVACY.md](PRIVACY.md).

## Boundaries

- Protected Mozilla pages and browser UI (`about:`, extension pages, etc.) are not scriptable.
- Cross-origin frames are supported where Firefox grants host access. Enumerate frame IDs first.
- Open shadow roots are searched; closed shadow roots are inaccessible.
- DOM click/fill/key events are synthetic, not trusted OS input. `key` dispatches events without native typing/default actions.
- Console capture starts when requested, is bounded to 200 entries per frame, resets on navigation, and is page-visible. It is not Firefox's historical DevTools console or network debugger.
- Screenshot capture is the tab viewport, not an automatic full-page stitched image.
- Commands time out after 30 seconds. Timeout/disconnection does not roll back an operation; inspect state before retrying mutations.
- Firefox and Mozilla control signing/review. A packaged ZIP is not a signed release.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run build
npx web-ext run --source-dir extension
```

The extension is plain, readable JavaScript copied unchanged into a ZIP. There is no transpilation or minification. The native companion has no npm dependencies. `web-ext` is development-only. The minimal Codex skill is in `skill/firefox-control/SKILL.md`.

Uninstall: remove the extension, `~/.local/bin/firefox-control`, `~/.local/share/firefox-control`, and `com.anveio.firefox_control.json` from macOS `~/Library/Application Support/Mozilla/NativeMessagingHosts/` or Linux `~/.mozilla/native-messaging-hosts/`.

## One-command development reload

After rebuilding an opted-in extension:

```sh
firefox-control extensions reload socialultra-feed@anveio.local --expect-version 1.0.83
firefox-control extensions reload self --expect-version 0.2.0
```

The command pins the selected Firefox profile, requests one reload, and waits for a new background instance with the matching request ID. It reports the version actually loaded, and fails if `--expect-version` differs. It does not build source or refresh website tabs. If a command times out, inspect before retrying; the reload request is never automatically resent.

To opt another local extension in, copy `extension/reload.js` into that extension, include it in its background scripts, and give it `storage` permission. Load it once using Firefox's development tools. The handler accepts only the exact Firefox Control extension ID and only status/reload commands. It exposes no page data or script-execution facility. This uses Firefox's public runtime messaging/reload APIs; it does not open a debugger port, change browser preferences, or manage arbitrary third-party extensions. Remove the handler from an extension to remove its opt-in.

Verified in Firefox 159: a CLI reload of the temporary SocialUltra extension read its rebuilt files and changed its loaded manifest version from 1.0.82 to 1.0.83. Self-reload also reconnected successfully. Signed installations reload their installed package; they do not read this source checkout.
