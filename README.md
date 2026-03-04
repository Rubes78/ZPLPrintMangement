# ZPL Print Management

A self-hosted web application for creating, editing, storing, and testing Zebra ZPL labels. Built with React + Vite on the frontend and Node.js/Express on the backend, packaged as a Docker container.

---

## Features

### Label Editor
- **Visual canvas editor** — drag-and-drop text, barcodes (Code 128, Code 39), QR codes, boxes, lines, and images onto a label
- **Paste ZPL directly** — paste raw ZPL code to import it as editable canvas elements, or save it straight to the library as-is
- **Real-time ZPL output** — color-coded ZPL panel updates live as you edit, with `^FX` comments explaining every command
- **Labelary preview** — renders a PNG preview of the label via the Labelary API

### Label Library
- **In-app storage** — labels are saved to the server (persisted in a Docker volume), not downloaded as files
- **Save / Load / Delete** — manage a library of canvas labels and raw ZPL labels
- **New label** — clear the canvas and start fresh while keeping the library intact

### Printer Commands
Configure ZPL printer settings per-label, all reflected immediately in the ZPL output:

| Setting | ZPL Command | Description |
|---|---|---|
| Darkness | `~SD` | Print density 0–30 |
| Print Speed | `^PR` | Media speed in ips |
| Media Type | `^MT` | Thermal Transfer or Direct Thermal |
| Sensing / Label Type | `^MN` | Gap, Black Mark, Continuous, Auto |
| Print Mode | `^MM` | Tear-off, Peel, Rewind, Cutter |
| Feed / Backfeed | `^MF` | Media motion behavior after printing |
| Label Top | `^LT` | Up/down offset in dots |
| Label Shift | `^LS` | Left/right offset in dots |
| Tear-off Adjust | `^TA` | Fine-tune cut/tear position |
| Extra ZPL | — | Raw ZPL injected inside `^XA…^XZ` |

### Print Testing
- Send labels directly to a **Zebra printer over TCP/IP** (raw port 9100)
- **QZ Tray** support for browser-based raw printing (auto-generates and signs a code-signing certificate)
- **Auto-discovery** of printers on the local subnet via port scan, mDNS/Bonjour, and SNMP
- **Template variables** — use `{{varName}}` in text/barcode fields and fill values at print time

---

## Quick Start

### Docker (recommended)

```yaml
# docker-compose.yml
services:
  zpl-editor:
    build: .
    container_name: zpl-editor
    network_mode: host          # required for mDNS printer discovery
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3200
      - HTTPS_PORT=3201
      - DATA_DIR=/app/data
    volumes:
      - /your/data/path:/app/data   # labels, printers, and TLS certs persist here
```

```bash
docker compose up -d
```

Open **http://SERVER_IP:3200** or **https://SERVER_IP:3201**

> **HTTPS note:** A self-signed TLS certificate is generated automatically on first start. To avoid browser warnings, visit `https://SERVER_IP:3201/api/tls-cert` to download and install it. HTTPS is required for QZ Tray's "Always Allow" to work.

### Local Development

```bash
# Terminal 1 — backend
npm install
node server.js

# Terminal 2 — frontend dev server
cd client
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:3200` automatically.

---

## Project Structure

```
.
├── server.js              # Express backend — API, print, preview proxy, printer discovery
├── bridge.ps1             # PowerShell bridge script for Windows direct printing
├── Dockerfile
├── docker-compose.yml
└── client/
    └── src/
        ├── App.jsx                      # Root component, state management
        ├── components/
        │   ├── Header.jsx               # Top bar — label name, size, zoom, actions
        │   ├── ElementPalette.jsx       # Left sidebar — add elements to canvas
        │   ├── LabelCanvas.jsx          # Fabric.js canvas editor
        │   ├── PropertiesPanel.jsx      # Right panel — element & label properties
        │   ├── ZplPanel.jsx             # Right panel — ZPL output + paste ZPL
        │   ├── LabelLibrary.jsx         # Library drawer — save/load/delete labels
        │   ├── PrintDialog.jsx          # Print modal — printer selection & template vars
        │   └── PrinterSettings.jsx      # Printer management modal
        └── lib/
            ├── zplGenerator.js          # Canvas objects → ZPL string (with ^FX comments)
            ├── zplParser.js             # ZPL string → canvas elements
            ├── elementFactory.js        # Fabric.js object constructors
            ├── imageToGfa.js            # Image → ZPL ^GFA bitmap
            └── qzTray.js               # QZ Tray integration
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/labels` | List all saved labels |
| `POST` | `/api/labels` | Save or update a label |
| `DELETE` | `/api/labels/:id` | Delete a label |
| `GET` | `/api/printers` | List configured printers |
| `POST` | `/api/printers` | Add a printer |
| `DELETE` | `/api/printers/:name` | Remove a printer |
| `GET` | `/api/printers/discover` | Scan subnet for Zebra printers |
| `POST` | `/api/print` | Send ZPL to a printer via TCP |
| `POST` | `/api/preview` | Proxy to Labelary for PNG preview |
| `GET` | `/api/qz-cert` | QZ Tray code-signing certificate |
| `POST` | `/api/qz-sign` | Sign QZ Tray challenge |
| `GET` | `/api/tls-cert` | Download TLS certificate for browser trust |
| `GET` | `/api/ps-bridge` | Download PowerShell bridge script |

---

## Data Persistence

All persistent data lives in `DATA_DIR` (default `./data/`, mapped to `/app/data` in Docker):

| File | Contents |
|---|---|
| `labels.json` | Saved label library |
| `printers.json` | Configured printer list |
| `qz-cert.pem` / `qz-key.pem` | QZ Tray code-signing keypair |
| `tls-cert.pem` / `tls-key.pem` | HTTPS TLS certificate |

Certificates are generated automatically on first start and reused on subsequent starts/rebuilds.

---

## ZPL Output Format

The generator produces annotated ZPL with `^FX` comment lines:

```zpl
^FX Darkness: 20/30  (0=lightest, 30=darkest)  [persistent]^FS
~SD20
^XA
^FX Label: 4.0" × 6.0"  |  203 DPI  |  812 × 1218 dots^FS
^PW812
^LL1218
^LH0,0
^FX Print Speed: 4 ips  (^PR)^FS
^PR4
^FX Sensing: Black Mark  (^MN)^FS
^MNM
^FX ─── Label Content ───────────────────────────────────^FS
^FO100,100^A0N,40,0^FDHello World^FS
^FO100,200^BY2,3,80^BCN,80,Y,N,N^FD123456789^FS
^XZ
```

---

## License

MIT
