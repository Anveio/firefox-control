# Reviewer instructions

This is a local automation and one-shot user-script manager. Its companion is required for its stated functionality. Source and installation instructions: https://github.com/Anveio/firefox-control

1. Use Firefox 153+ and Node.js 22+ on macOS or Linux.
2. Clone the repository, then run `node cli/firefox-control.mjs install` (no dependencies).
3. Install the extension. Click its toolbar icon and grant userScripts permission. This explicit opt-in enables the native bridge. Clicking again pauses it.
4. Run `firefox-control profiles` and `firefox-control --help`.
5. Create a test tab with `firefox-control tabs create '{"url":"https://example.com"}'`.
6. Using its returned ID, run `firefox-control eval TAB 'return document.title'` and `firefox-control snapshot TAB`.
7. `firefox-control scripts list` displays stored scripts, and `scripts delete ID` removes them. The extension Preferences page also displays script source and removal controls.

Every eval invocation is an explicit CLI action installing and immediately executing a user-provided script in one selected tab/frame. Scripts are never fetched from a remote repository or automatically executed on page load. Up to 50 sources are retained for inspection/removal, with origin matching before re-execution. They run through the userScripts API in MAIN or USER_SCRIPT world without extension privileges. Bundled DOM operations use scripting.executeScript with static packaged functions.

Native messaging accepts commands only from the locally installed companion, whose registration allows only this extension ID. The companion uses owner-only Unix sockets in an owner-only directory, not an HTTP/TCP control server. There are no externally_connectable handlers, page message command handlers, analytics, or cloud services. Data collection permissions disclose website content, activity and browsing metadata transferred to the user's own local CLI. The companion does not log browser results.

The cookies permission is needed by Firefox's contextual identity/container support; this extension does not call the cookies API or read the cookie database. tabs is used for selected tab metadata/control; webNavigation enumerates frame IDs; storage retains settings/scripts; scripting runs packaged page operations; nativeMessaging connects the local companion; host permissions enable interaction with user-selected sites.

The extension folder contains readable original JavaScript, HTML and SVG. No transpilation, bundling, minification or generated extension code. `npm run build` uses system zip to archive the extension folder unchanged. Companion source is included in the source package and public repository.
