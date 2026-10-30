# Privacy

Firefox Control handles browser data only when a local program issues a command. Requested tab URLs/titles, website content, screenshots, page interaction results and console entries are sent through Firefox native messaging to a companion running on the same computer. They are returned to the calling local process. The extension and companion do not send browser data to the developer or to a remote server, and contain no analytics or telemetry.

The extension stores a profile identifier, an optional profile name, its enabled state, and up to 50 user-script sources (with origin and creation time) locally. Scripts can be removed in Preferences or with the CLI. Console recording is opt-in, memory-only, bounded to 200 entries per frame and ends on navigation or an explicit stop command. Browser results are not logged by the companion; screenshots are saved only to the path requested by the caller.

Other software using the CLI can read or transmit its results under that software's own policies. Scripts supplied by the caller can interact with websites and make network requests under Firefox's normal page security rules. Only run trusted commands and scripts. Click the extension icon to pause control, or uninstall the extension and companion to remove access.
