const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const dns = require('dns');
const dgram = require('dgram');
const crypto = require('crypto');
const { execSync, execFile } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT       = process.env.PORT       || 3200;
const HTTPS_PORT = process.env.HTTPS_PORT || 3201;

// Printers file lives in a volume-mounted data directory so it survives rebuilds.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PRINTERS_FILE = path.join(DATA_DIR, 'printers.json');

// ── QZ Tray signing certificate ───────────────────────────────────────────────
// Generated once, stored in the data volume. QZ Tray fingerprints this cert so
// "Always Allow" persists — the same cert survives container rebuilds.
// Requires: -x509 flag (actual cert, not a CSR) + codeSigning EKU so QZ Tray's
// "Remember this decision" checkbox can enable the Allow button.
const QZ_CERT_FILE = path.join(DATA_DIR, 'qz-cert.pem');
const QZ_KEY_FILE  = path.join(DATA_DIR, 'qz-key.pem');
const QZ_CNF_FILE  = path.join(DATA_DIR, 'qz-openssl.cnf');

function isRealCert(file) {
  try { return fs.readFileSync(file, 'utf8').includes('-----BEGIN CERTIFICATE-----'); }
  catch { return false; }
}

if (!isRealCert(QZ_CERT_FILE) || !fs.existsSync(QZ_KEY_FILE)) {
  console.log('Generating QZ Tray signing certificate…');
  fs.writeFileSync(QZ_CNF_FILE, `[req]
distinguished_name = req_dn
x509_extensions    = v3_cert
prompt             = no

[req_dn]
CN = ZPL Label Editor

[v3_cert]
basicConstraints   = CA:FALSE
keyUsage           = digitalSignature, nonRepudiation
extendedKeyUsage   = codeSigning
subjectKeyIdentifier = hash
`);
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${QZ_KEY_FILE}" -out "${QZ_CERT_FILE}" ` +
    `-days 3650 -nodes -config "${QZ_CNF_FILE}"`,
    { stdio: 'pipe' }
  );
  console.log('QZ Tray certificate generated.');
}

// ── HTTPS / TLS certificate ───────────────────────────────────────────────────
// A self-signed TLS cert lets the editor run over HTTPS, which is required for
// QZ Tray's "Remember this decision" → Allow to work.
// SAN includes all local IPs so the cert is valid from any LAN address.
const TLS_CERT_FILE = path.join(DATA_DIR, 'tls-cert.pem');
const TLS_KEY_FILE  = path.join(DATA_DIR, 'tls-key.pem');
const TLS_CNF_FILE  = path.join(DATA_DIR, 'tls-openssl.cnf');

if (!isRealCert(TLS_CERT_FILE) || !fs.existsSync(TLS_KEY_FILE)) {
  console.log('Generating HTTPS certificate…');
  const localIps = Object.values(os.networkInterfaces())
    .flat().filter((a) => a.family === 'IPv4').map((a) => `IP:${a.address}`);
  const sans = [...new Set(['IP:127.0.0.1', 'DNS:localhost', ...localIps])].join(',');
  fs.writeFileSync(TLS_CNF_FILE, `[req]
distinguished_name = req_dn
x509_extensions    = v3_tls
prompt             = no

[req_dn]
CN = ZPL Label Editor

[v3_tls]
basicConstraints      = CA:FALSE
keyUsage              = digitalSignature, keyEncipherment
extendedKeyUsage      = serverAuth
subjectAltName        = ${sans}
subjectKeyIdentifier  = hash
`);
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${TLS_KEY_FILE}" -out "${TLS_CERT_FILE}" ` +
    `-days 3650 -nodes -config "${TLS_CNF_FILE}"`,
    { stdio: 'pipe' }
  );
  console.log('HTTPS certificate generated.');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
}

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── PowerShell bridge script download ────────────────────────────────────────
app.get('/api/ps-bridge', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="zpl-bridge.ps1"');
  res.type('text/plain').sendFile(path.join(__dirname, 'bridge.ps1'));
});

// ── QZ Tray certificate + signing ─────────────────────────────────────────────
app.get('/api/qz-cert', (req, res) => {
  res.type('text/plain').send(fs.readFileSync(QZ_CERT_FILE, 'utf8'));
});

app.post('/api/qz-sign', express.text({ type: '*/*' }), (req, res) => {
  try {
    const sign = crypto.createSign('SHA512');
    sign.update(req.body);
    res.send(sign.sign(fs.readFileSync(QZ_KEY_FILE, 'utf8'), 'base64'));
  } catch {
    res.status(500).send('');
  }
});

// ── Labelry preview proxy ─────────────────────────────────────────────────────
app.post('/api/preview', async (req, res) => {
  const { zpl, widthInches, heightInches, dpi = 203 } = req.body;
  if (!zpl) return res.status(400).json({ error: 'Missing zpl' });

  const dpmm = dpi === 300 ? 12 : 8;
  const w = parseFloat(widthInches) || 4;
  const h = parseFloat(heightInches) || 6;
  const url = `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${w}x${h}/0/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'image/png' },
      body: zpl,
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Labelry error ${response.status}: ${text}` });
    }
    const buf = await response.buffer();
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: `Labelry unreachable: ${err.message}` });
  }
});

// ── Raw TCP print ─────────────────────────────────────────────────────────────
app.post('/api/print', async (req, res) => {
  const { zpl, printerIp, printerPort = 9100, copies = 1 } = req.body;
  if (!zpl || !printerIp) return res.status(400).json({ error: 'Missing zpl or printerIp' });

  const n = Math.max(1, parseInt(copies) || 1);
  const finalZpl = n > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${n},0,1,Y$1`) : zpl;

  try {
    await sendRawZpl(finalZpl, printerIp, parseInt(printerPort));
    res.json({ success: true, message: `Sent to ${printerIp}:${printerPort}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sendRawZpl(zpl, ip, port) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(8000);
    socket.connect(port, ip, () => {
      socket.write(zpl, 'utf8', () => socket.end());
    });
    socket.on('close', resolve);
    socket.on('error', (err) => reject(new Error(`Printer connection failed: ${err.message}`)));
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timed out connecting to ${ip}:${port}`)); });
  });
}

// ── Saved printers (file-backed, volume-mounted) ──────────────────────────────
function loadPrinters() {
  try { return JSON.parse(fs.readFileSync(PRINTERS_FILE, 'utf8')); } catch { return []; }
}
function savePrinters(printers) {
  fs.writeFileSync(PRINTERS_FILE, JSON.stringify(printers, null, 2));
}

app.get('/api/printers', (req, res) => res.json(loadPrinters()));

app.post('/api/printers', (req, res) => {
  const { name, ip, port = 9100, type = 'tcp', printerName } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (type === 'qz' && !printerName) return res.status(400).json({ error: 'Missing printerName' });
  if (type !== 'qz' && !ip) return res.status(400).json({ error: 'Missing ip' });
  const printers = loadPrinters().filter((p) => p.name !== name);
  const entry = type === 'qz'
    ? { name, printerName, type: 'qz' }
    : { name, ip, port: parseInt(port), type: 'tcp' };
  printers.push(entry);
  savePrinters(printers);
  res.json({ success: true, printers });
});

app.delete('/api/printers/:name', (req, res) => {
  const printers = loadPrinters().filter((p) => p.name !== req.params.name);
  savePrinters(printers);
  res.json({ success: true, printers });
});

// ── Network interface info (for subnet pre-fill in UI) ───────────────────────
app.get('/api/printers/subnets', (req, res) => {
  const subnets = getLocalSubnets();
  res.json({ subnets });
});

// ── Printer discovery: port scan + mDNS ──────────────────────────────────────
app.get('/api/printers/discover', async (req, res) => {
  const subnets = getLocalSubnets();
  const subnet  = req.query.subnet || subnets[0]?.cidr24 || '192.168.1.0/24';

  const [scanResult, mdnsResult] = await Promise.allSettled([
    scanSubnetForPort(subnet, 9100),
    discoverViaMdns(4000),
  ]);

  const scanned = scanResult.status === 'fulfilled' ? scanResult.value : [];
  const mdns    = mdnsResult.status  === 'fulfilled' ? mdnsResult.value : [];

  // Merge: prefer mDNS name when we have it
  const byIp = new Map();
  for (const p of scanned) byIp.set(p.ip, p);
  for (const p of mdns) {
    byIp.set(p.ip, byIp.has(p.ip)
      ? { ...byIp.get(p.ip), name: p.name }
      : p);
  }

  res.json({ printers: [...byIp.values()], subnet });
});

// ── Subnet scanner ────────────────────────────────────────────────────────────
function getLocalSubnets() {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [ifname, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        result.push({
          interface: ifname,
          ip: addr.address,
          cidr24: `${parts[0]}.${parts[1]}.${parts[2]}.0/24`,
        });
      }
    }
  }
  return result;
}

function cidr24ToIPs(cidr) {
  const base = cidr.replace(/\/\d+$/, '').split('.');
  // .1 – .254 (skip network and broadcast)
  return Array.from({ length: 254 }, (_, i) => `${base[0]}.${base[1]}.${base[2]}.${i + 1}`);
}

function probePort(ip, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.connect(port, ip, () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

// Query a Zebra printer's model name via the ~HI host-identification command.
// The printer responds with a STX-delimited string like:
//   <STX>MANUFACTURER,MODEL,FIRMWARE,SERIAL<ETX>
// Zebra printers typically keep the connection open, so we rely on timeout to
// close the socket — the close handler then parses whatever data was received.
function queryZebraName(ip, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let data = '';
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      // Response format: \x02MANUFACTURER,MODEL,FIRMWARE,SERIAL\x03
      const match = data.match(/\x02?([^\x02\x03,\r\n]+),([^\x02\x03,\r\n]+)/);
      resolve(match ? `${match[1].trim()} ${match[2].trim()}` : null);
    }

    sock.setTimeout(timeoutMs);
    sock.connect(port, ip, () => sock.write('~HI'));
    sock.on('data', (chunk) => {
      data += chunk.toString('latin1');
      // ETX marks end of response — no need to wait for timeout
      if (data.includes('\x03')) sock.destroy();
    });
    sock.on('close', finish);
    sock.on('error', () => { done = true; resolve(null); });
    // On timeout, destroy triggers 'close' which calls finish() with accumulated data
    sock.on('timeout', () => sock.destroy());
  });
}

// DNS reverse lookup — returns first hostname or null.
function dnsReverseLookup(ip) {
  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      if (err || !hostnames?.length) return resolve(null);
      // Strip trailing dot and common suffixes to get a friendly name
      const host = hostnames[0].replace(/\.$/, '').replace(/\.local$/i, '');
      resolve(host);
    });
  });
}

// SNMP v1 GET for sysName (OID 1.3.6.1.2.1.1.5.0, community "public").
// This returns the printer's configured system name — the same name visible in
// Windows Print Management, router DHCP tables, and the device's web UI.
// Pre-built packet: community=public, request-id=1, OID=1.3.6.1.2.1.1.5.0
const SNMP_GET_SYSNAME = Buffer.from([
  0x30, 0x29,                                            // SEQUENCE len=41
  0x02, 0x01, 0x00,                                      // version = 0 (v1)
  0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63,       // community = "public"
  0xa0, 0x1c,                                            // GetRequest-PDU len=28
  0x02, 0x04, 0x00, 0x00, 0x00, 0x01,                   // request-id = 1
  0x02, 0x01, 0x00,                                      // error-status = 0
  0x02, 0x01, 0x00,                                      // error-index = 0
  0x30, 0x0e,                                            // VarBindList len=14
  0x30, 0x0c,                                            // VarBind len=12
  0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x05, 0x00,  // OID
  0x05, 0x00,                                            // NULL
]);

function snmpGetSysName(ip, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const timer = setTimeout(() => { try { sock.close(); } catch {} resolve(null); }, timeoutMs);

    sock.on('message', (buf) => {
      clearTimeout(timer);
      try { sock.close(); } catch {}
      // Parse: find GetResponse PDU (0xa2), walk to VarBind value
      let i = buf.indexOf(0xa2);
      if (i === -1) return resolve(null);
      i += 2; // skip PDU tag + length byte
      // Skip request-id, error-status, error-index (each: tag + len + data)
      for (let skip = 0; skip < 3; skip++) {
        if (i >= buf.length) return resolve(null);
        i += 2 + buf[i + 1]; // tag(1) + len(1) + data
      }
      // VarBindList (0x30) → VarBind (0x30) → OID (0x06) → value
      if (buf[i] !== 0x30) return resolve(null); i += 2;
      if (buf[i] !== 0x30) return resolve(null); i += 2;
      if (buf[i] !== 0x06) return resolve(null); i += 2 + buf[i + 1]; // skip OID
      // Value must be OCTET STRING (0x04)
      if (buf[i] !== 0x04) return resolve(null);
      const len = buf[i + 1];
      resolve(buf.slice(i + 2, i + 2 + len).toString('utf8').trim() || null);
    });

    sock.on('error', () => { clearTimeout(timer); resolve(null); });
    sock.send(SNMP_GET_SYSNAME, 161, ip, (err) => { if (err) { clearTimeout(timer); sock.close(); resolve(null); } });
  });
}

// Build an IPP Get-Printer-Attributes request for the given printer URI.
function buildIppGetAttrs(printerUri) {
  function encAttr(tag, name, value) {
    const n = Buffer.from(name, 'utf8');
    const v = Buffer.from(value, 'utf8');
    const b = Buffer.allocUnsafe(1 + 2 + n.length + 2 + v.length);
    let o = 0;
    b[o++] = tag;
    b.writeUInt16BE(n.length, o); o += 2;
    n.copy(b, o); o += n.length;
    b.writeUInt16BE(v.length, o); o += 2;
    v.copy(b, o);
    return b;
  }
  function encExtra(tag, value) {
    const v = Buffer.from(value, 'utf8');
    const b = Buffer.allocUnsafe(1 + 4 + v.length);
    let o = 0;
    b[o++] = tag;
    b.writeUInt16BE(0, o); o += 2;   // empty name = additional value
    b.writeUInt16BE(v.length, o); o += 2;
    v.copy(b, o);
    return b;
  }
  return Buffer.concat([
    Buffer.from([0x01, 0x01, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x01, 0x01]),
    encAttr(0x47, 'attributes-charset',          'utf-8'),
    encAttr(0x48, 'attributes-natural-language', 'en'),
    encAttr(0x45, 'printer-uri',                 printerUri),
    encAttr(0x44, 'requested-attributes',        'printer-name'),
    encExtra(0x44, 'printer-info'),
    Buffer.from([0x03]),
  ]);
}

// Parse the printer-name or printer-info from an IPP Get-Printer-Attributes response.
function parseIppName(buf) {
  if (buf.length < 8) return null;
  let i = 8; // skip 8-byte header
  while (i < buf.length) {
    const tag = buf[i];
    if (tag < 0x10) { i++; continue; } // group delimiter tag
    if (i + 3 > buf.length) break;
    const nameLen = buf.readUInt16BE(i + 1);
    if (i + 3 + nameLen + 2 > buf.length) break;
    const name = buf.slice(i + 3, i + 3 + nameLen).toString('utf8');
    const valLen = buf.readUInt16BE(i + 3 + nameLen);
    const valStart = i + 3 + nameLen + 2;
    if (valStart + valLen > buf.length) break;
    if ((name === 'printer-name' || name === 'printer-info') && valLen > 0) {
      return buf.slice(valStart, valStart + valLen).toString('utf8').trim() || null;
    }
    i = valStart + valLen;
  }
  return null;
}

// Query IPP (port 631) for the printer's display name. Works with Windows print
// servers and most modern network printers. Tries common IPP paths in order.
function queryIppName(ip, timeoutMs = 2000) {
  const paths = ['/ipp/print', '/ipp/printer', '/printers', '/'];

  function tryPath(idx) {
    if (idx >= paths.length) return Promise.resolve(null);
    const urlPath = paths[idx];
    const body = buildIppGetAttrs(`ipp://${ip}:631${urlPath}`);

    return new Promise((resolve) => {
      const req = http.request(
        { hostname: ip, port: 631, path: urlPath, method: 'POST',
          headers: { 'Content-Type': 'application/ipp', 'Content-Length': body.length } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try { resolve(parseIppName(Buffer.concat(chunks))); }
            catch { resolve(null); }
          });
        }
      );
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    }).then((name) => name || tryPath(idx + 1));
  }

  return tryPath(0);
}

// NetBIOS Node Status Request for wildcard name '*'.
// Sent to UDP port 137; the target responds with all its registered NetBIOS names.
// '*' (0x2A) encoded: high nibble 2 → 'C', low nibble 10 → 'K'.
// Remaining 15 null bytes each encode as 'A','A'.
const NBNS_STATUS_REQUEST = Buffer.from([
  0x00, 0x01,  // Transaction ID = 1
  0x00, 0x00,  // Flags: standard query
  0x00, 0x01,  // QDCOUNT = 1
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // ANCOUNT / NSCOUNT / ARCOUNT = 0
  0x20,        // Name length = 32
  0x43, 0x4B,  // '*' encoded
  0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,  // 15 null bytes encoded
  0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
  0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
  0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
  0x00,        // End of name
  0x00, 0x21,  // Type: NBSTAT (33)
  0x00, 0x01,  // Class: IN
]);

// Query NetBIOS hostname from a Windows machine (UDP port 137).
// Returns the computer's NetBIOS name (e.g. "DESKTOP-ABC123"), or null.
function queryNetbiosName(ip, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const timer = setTimeout(() => { try { sock.close(); } catch {} resolve(null); }, timeoutMs);

    sock.on('message', (buf) => {
      clearTimeout(timer);
      try { sock.close(); } catch {}
      // Must be a response (QR bit) with at least 1 answer
      if (buf.length < 57 || !(buf[2] & 0x80) || buf.readUInt16BE(6) < 1) return resolve(null);

      // Answer NAME: Windows may use a 2-byte compressed pointer (0xC0 xx) or the full 34-byte name
      let off = 50; // 12 header + 38 question
      if (buf[off] === 0xC0)       off += 2;   // compressed pointer
      else if (buf[off] === 0x20)  off += 34;  // full name
      else                          return resolve(null);

      // Skip TYPE(2) + CLASS(2) + TTL(4) + RDLENGTH(2) = 10 bytes
      off += 10;

      if (off >= buf.length) return resolve(null);
      const numNames = buf[off++];

      for (let i = 0; i < numNames; i++) {
        const nameOff = off + i * 18;
        if (nameOff + 18 > buf.length) break;
        const suffix = buf[nameOff + 15];
        const flags  = buf.readUInt16BE(nameOff + 16);
        const isGroup = !!(flags & 0x8000);
        // Suffix 0x00 = unique workstation/computer name
        if (suffix === 0x00 && !isGroup) {
          const name = buf.slice(nameOff, nameOff + 15).toString('ascii').replace(/[\x00 ]/g, '').trim();
          return resolve(name || null);
        }
      }
      resolve(null);
    });

    sock.on('error', () => { clearTimeout(timer); resolve(null); });
    sock.send(NBNS_STATUS_REQUEST, 137, ip, (err) => {
      if (err) { clearTimeout(timer); try { sock.close(); } catch {} resolve(null); }
    });
  });
}

// Run all name lookups in parallel; return best available name.
// For direct ZPL printers: shows model name.
// For Windows print servers: shows printer share name (IPP) or "Printer @ HOSTNAME".
async function identifyPrinter(ip, port) {
  const [zebraName, ippName, snmpName, dnsName, nbnsName] = await Promise.all([
    queryZebraName(ip, port),
    queryIppName(ip),
    snmpGetSysName(ip),
    dnsReverseLookup(ip),
    queryNetbiosName(ip),
  ]);
  // Use the most informative hostname available for the fallback label
  const hostName = nbnsName || snmpName || dnsName;
  return zebraName || ippName || (hostName ? `Printer @ ${hostName}` : `Printer @ ${ip}`);
}

async function scanSubnetForPort(cidr, port, timeoutMs = 800) {
  const ips = cidr24ToIPs(cidr);
  const found = [];
  const CONCURRENCY = 60;

  for (let i = 0; i < ips.length; i += CONCURRENCY) {
    const batch = ips.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((ip) => probePort(ip, port, timeoutMs)));
    const openIps = batch.filter((_, j) => results[j]);
    // Identify all open printers in parallel (name resolution is fast per-host)
    const named = await Promise.all(
      openIps.map(async (ip) => ({
        ip,
        port,
        name: await identifyPrinter(ip, port),
        source: 'scan',
      }))
    );
    found.push(...named);
  }
  return found;
}

// ── mDNS / Bonjour discovery ──────────────────────────────────────────────────
// Looks for raw-TCP print services (_pdl-datastream), IPP (_ipp), and generic
// printer announcements (_printer). Zebra printers typically use _pdl-datastream.
function discoverViaMdns(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const found = new Map();

    let bonjour;
    try {
      const { Bonjour } = require('bonjour-service');
      bonjour = new Bonjour();
    } catch (e) {
      console.warn('bonjour-service unavailable:', e.message);
      return resolve([]);
    }

    const SERVICE_TYPES = ['pdl-datastream', 'printer', 'ipp', 'ipps'];
    const browsers = SERVICE_TYPES.map((type) => {
      const browser = bonjour.find({ type });
      browser.on('up', (svc) => {
        // Prefer a plain IPv4 address; fall back to hostname
        const ip = (svc.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || svc.host;
        if (!ip || found.has(ip)) return;
        found.set(ip, {
          ip,
          port: svc.port || 9100,
          name: svc.name || `Printer @ ${ip}`,
          source: 'mdns',
          type: svc.type,
        });
      });
      return browser;
    });

    setTimeout(() => {
      browsers.forEach((b) => { try { b.stop(); } catch {} });
      try { bonjour.destroy(); } catch {}
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

// ── Fields ────────────────────────────────────────────────────────────────────
const FIELDS_FILE = path.join(DATA_DIR, 'fields.json');
const DEFAULT_FIELDS = [
  'CompanyName','Store','Color','Department',
  'Category','SubCategory','Date','Size','Price','barcode',
].map(name => ({ name, builtin: true }));

function loadFields() {
  try {
    const raw = JSON.parse(fs.readFileSync(FIELDS_FILE, 'utf8'));
    // Migrate legacy string arrays
    let fields = raw.map(f => typeof f === 'string' ? { name: f, builtin: false } : f);
    if (!fields.length) return DEFAULT_FIELDS;
    // Ensure all default builtins are present (handles additions to DEFAULT_FIELDS)
    let changed = false;
    for (const def of DEFAULT_FIELDS) {
      if (!fields.some(f => f.name === def.name)) {
        fields.push(def);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(FIELDS_FILE, JSON.stringify(fields, null, 2));
    return fields;
  } catch { return DEFAULT_FIELDS; }
}
function saveFields(fields) {
  fs.writeFileSync(FIELDS_FILE, JSON.stringify(fields, null, 2));
}

app.get('/api/fields', (req, res) => res.json(loadFields()));

app.post('/api/fields', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing name' });
  const fields = loadFields();
  if (fields.some(f => f.name.toLowerCase() === name.toLowerCase()))
    return res.json({ success: true, fields });
  fields.push({ name, builtin: false });
  saveFields(fields);
  res.json({ success: true, fields });
});

app.patch('/api/fields/:name', (req, res) => {
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string') return res.status(400).json({ error: 'Missing newName' });
  const fields = loadFields();
  const idx = fields.findIndex(f => f.name === req.params.name);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  fields[idx] = { ...fields[idx], name: newName };
  saveFields(fields);
  res.json({ success: true, fields });
});

app.delete('/api/fields/:name', (req, res) => {
  const fields = loadFields();
  const field = fields.find(f => f.name === req.params.name);
  if (field?.builtin) return res.status(403).json({ error: 'Cannot delete built-in field' });
  saveFields(fields.filter(f => f.name !== req.params.name));
  res.json({ success: true });
});

// ── Labels library ────────────────────────────────────────────────────────────
const LABELS_FILE = path.join(DATA_DIR, 'labels.json');
function loadLabels() {
  try { return JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8')); } catch { return []; }
}
function saveLabels(labels) {
  fs.writeFileSync(LABELS_FILE, JSON.stringify(labels, null, 2));
}

app.get('/api/labels', (req, res) => res.json(loadLabels()));

app.post('/api/labels', (req, res) => {
  const { id, name, type = 'canvas', labelSettings, canvasJSON, zplCode } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const labels = loadLabels();
  const existingIdx = id ? labels.findIndex((l) => l.id === id) : -1;
  const entry = {
    id: id || Date.now().toString(),
    name,
    type,
    labelSettings,
    canvasJSON: canvasJSON || null,
    zplCode: zplCode || '',
    updatedAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) labels[existingIdx] = entry;
  else labels.unshift(entry);
  saveLabels(labels);
  res.json({ success: true, label: entry });
});

app.delete('/api/labels/:id', (req, res) => {
  saveLabels(loadLabels().filter((l) => l.id !== req.params.id));
  res.json({ success: true });
});

// ── Print Job History ─────────────────────────────────────────────────────────
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
function loadJobs() { try { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); } catch { return []; } }
function saveJobs(j) { fs.writeFileSync(JOBS_FILE, JSON.stringify(j, null, 2)); }

// List jobs (summary — omit records array for speed)
app.get('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  res.json(jobs.map(({ records, ...j }) => ({ ...j, recordCount: records?.length ?? 0 })));
});

// Full job including records
app.get('/api/jobs/:id', (req, res) => {
  const job = loadJobs().find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

// Create job
app.post('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  const job = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...req.body };
  jobs.unshift(job);
  saveJobs(jobs.slice(0, 200)); // keep last 200
  res.json({ job });
});

// Update job (e.g. mark records as printed)
app.patch('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  jobs[idx] = { ...jobs[idx], ...req.body };
  saveJobs(jobs);
  res.json({ job: jobs[idx] });
});

// Delete job
app.delete('/api/jobs/:id', (req, res) => {
  saveJobs(loadJobs().filter((j) => j.id !== req.params.id));
  res.json({ success: true });
});

// ── TLS cert download (install in browser/Windows to avoid the HTTPS warning) ─
app.get('/api/tls-cert', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="zpl-editor-ca.crt"');
  res.type('application/x-x509-ca-cert').send(fs.readFileSync(TLS_CERT_FILE));
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

// ── Start HTTP + HTTPS ────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZPL Editor (HTTP)  → http://0.0.0.0:${PORT}`);
});

https.createServer(
  { key: fs.readFileSync(TLS_KEY_FILE), cert: fs.readFileSync(TLS_CERT_FILE) },
  app
).listen(HTTPS_PORT, '0.0.0.0', () => {
  const ips = getLocalSubnets().map((s) => s.ip);
  console.log(`ZPL Editor (HTTPS) → https://0.0.0.0:${HTTPS_PORT}`);
  if (ips.length) console.log(`  Open: https://${ips[0]}:${HTTPS_PORT}`);
  console.log(`  To skip browser warning: https://${ips[0] || 'SERVER_IP'}:${HTTPS_PORT}/api/tls-cert`);
});
