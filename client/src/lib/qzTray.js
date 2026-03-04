// qz-tray is loaded as a plain <script> tag (window.qz) to avoid Vite
// bundling issues with the UMD package. See index.html.
function qz() { return window.qz; }

let certCache = null;

async function getCert() {
  if (!certCache) certCache = await fetch('/api/qz-cert').then((r) => r.text());
  return certCache;
}

export function isConnected() {
  return window.qz?.websocket?.isActive() ?? false;
}

export async function connect() {
  const q = window.qz;
  if (!q) throw new Error('QZ Tray script not loaded — check /qz-tray.js.');
  if (q.websocket.isActive()) return;

  q.security.setCertificatePromise((resolve) => resolve(getCert()));
  q.security.setSignatureAlgorithm('SHA512');
  q.security.setSignaturePromise((toSign) => (resolve) =>
    fetch('/api/qz-sign', { method: 'POST', body: toSign })
      .then((r) => r.text())
      .then(resolve)
  );

  // ws:// (port 8182) works from an HTTP page; wss:// requires HTTPS origin.
  const connectPromise = q.websocket.connect({ usingSecure: false });
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Timed out — click Allow in the QZ Tray dialog that appeared.')),
      30000
    )
  );

  await Promise.race([connectPromise, timeout]);
}

export async function listPrinters() {
  await connect();
  const result = await window.qz.printers.find();
  return Array.isArray(result) ? result : [result];
}

export async function printRaw(printerName, zpl) {
  await connect();
  const q = window.qz;
  const config = q.configs.create(printerName);
  await q.print(config, [{ type: 'raw', format: 'plain', data: zpl }]);
}
