/* Optional development reload protocol. No page access or arbitrary code execution. */
const handleControlReload = (() => {
  const controllerId = 'firefox-control@anveio.com';
  const protocol = 'firefox-control-reload-v1';
  const storageKey = '__firefoxControlReloadId';
  const bootId = crypto.randomUUID();
  let pending = false;
  async function handle(message) {
    if (!message || message.protocol !== protocol) throw new Error('Unsupported reload protocol');
    const manifest = browser.runtime.getManifest();
    const info = {protocol, id: browser.runtime.id, name: manifest.name, version: manifest.version,
      bootId, reloadId: (await browser.storage.local.get(storageKey))[storageKey] || null};
    if (message.action === 'info') return info;
    if (message.action !== 'reload') throw new Error('Unsupported reload action');
    if (typeof message.reloadId !== 'string' || !/^[a-f0-9-]{36}$/.test(message.reloadId)) throw new Error('Invalid reload request ID');
    if (pending) throw new Error('An extension reload is already pending');
    pending = true;
    try { await browser.storage.local.set({[storageKey]: message.reloadId}); }
    catch (error) { pending = false; throw error; }
    // Let the acknowledgement reach the caller before unloading this background.
    setTimeout(() => browser.runtime.reload(), 250);
    return {...info, accepted: true, reloadId: message.reloadId};
  }
  if (browser.runtime.id !== controllerId) {
    browser.runtime.onMessageExternal.addListener((message, sender) => {
      if (sender.id !== controllerId || message?.protocol !== protocol) return undefined;
      return handle(message);
    });
  }
  return handle;
})();
