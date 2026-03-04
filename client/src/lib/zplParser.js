/**
 * ZPL → canvas element parser.
 *
 * Tokenises ZPL commands (each ^XX) and runs a simple state machine
 * to reconstruct element descriptors that LabelCanvas.importFromParsed()
 * can consume to create Fabric.js objects.
 *
 * Supported commands:
 *   ^XA ^XZ  — label start/end (ignored)
 *   ^PW       — print width (dots)
 *   ^LL       — label length/height (dots)
 *   ^LH       — label home offset (ignored)
 *   ^FO ^FT   — field origin / field typeset (sets x,y)
 *   ^A0       — scalable font (sets fontHeight)
 *   ^CF       — change/default font (sets fontHeight)
 *   ^BY       — bar code field default (sets moduleWidth, barHeight)
 *   ^BC       — Code 128
 *   ^B3       — Code 39
 *   ^BQ       — QR Code
 *   ^GB       — graphic box / filled line
 *   ^GD       — graphic diagonal line (rendered as box approximation)
 *   ^FH       — field hex indicator (noted, data decoded)
 *   ^FD       — field data  → creates text / barcode element
 *   ^FS       — field separator (resets field state)
 *   ^PQ       — print quantity (ignored)
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} zplString  Raw ZPL input
 * @returns {{ elements: ElementDescriptor[], labelWidthDots: number|null, labelHeightDots: number|null }}
 */
export function parseZpl(zplString) {
  const elements = [];
  let labelWidthDots = null;
  let labelHeightDots = null;

  // Strip tilde (~) commands and normalise whitespace
  const zpl = zplString.replace(/~[A-Z][A-Z0-9][^~^]*/gi, '').replace(/\r\n|\r/g, '\n');

  // Tokenise: split on ^ boundaries, preserving the character after ^
  const tokens = tokenize(zpl);

  // ── State ────────────────────────────────────────────────────────────────
  let x = 0;
  let y = 0;
  let fontHeight = 30;
  let byModuleWidth = 2;
  let byBarHeight = 80;
  let pendingBarcode = null; // { type, height, showText, moduleWidth, magnification }
  let fieldHex = false;      // ^FH was seen in this field

  for (const { cmd, raw } of tokens) {
    const p = raw.trim().split(',');

    switch (cmd) {
      // ── Label geometry ──────────────────────────────────────────────────
      case 'PW':
        labelWidthDots = parseInt(p[0]) || labelWidthDots;
        break;

      case 'LL':
        labelHeightDots = parseInt(p[0]) || labelHeightDots;
        break;

      // ── Field origin ────────────────────────────────────────────────────
      case 'FO':
      case 'FT': {
        x = parseInt(p[0]) || 0;
        y = parseInt(p[1]) || 0;
        pendingBarcode = null;
        fieldHex = false;
        break;
      }

      // ── Font ─────────────────────────────────────────────────────────────
      case 'A0': {
        // ^A0N,height,width  OR  ^A0,height,width  (rotation optional)
        let i = 0;
        if (p[0] && 'NRIB'.includes(p[0].trim().toUpperCase())) i = 1;
        fontHeight = parseInt(p[i]) || fontHeight;
        break;
      }

      case 'CF': {
        // ^CF0,height  — change default font
        fontHeight = parseInt(p[1]) || fontHeight;
        break;
      }

      // ── Bar code defaults ────────────────────────────────────────────────
      case 'BY': {
        byModuleWidth = parseInt(p[0]) || byModuleWidth;
        // p[2] is bar height (p[1] is wide-bar ratio)
        byBarHeight = parseInt(p[2]) || byBarHeight;
        break;
      }

      // ── Barcode type commands ─────────────────────────────────────────────
      case 'BC': {
        // ^BCN,height,showText,above,UCC
        const h = parseInt(p[1]) || byBarHeight;
        const show = !p[2] || p[2].trim().toUpperCase() !== 'N';
        pendingBarcode = { type: 'code128', height: h, showText: show, moduleWidth: byModuleWidth };
        break;
      }

      case 'B3': {
        // ^B3N,checkDigit,height,showText,above
        const h = parseInt(p[2]) || byBarHeight;
        const show = !p[3] || p[3].trim().toUpperCase() !== 'N';
        pendingBarcode = { type: 'code39', height: h, showText: show, moduleWidth: byModuleWidth };
        break;
      }

      case 'BQ': {
        // ^BQN,model,magnification,errCorr,mask
        const mag = parseInt(p[2]) || 4;
        pendingBarcode = { type: 'qrcode', magnification: mag };
        break;
      }

      // ── Graphic box / line ────────────────────────────────────────────────
      case 'GB': {
        const w = parseInt(p[0]) || 10;
        const h = parseInt(p[1]) || 10;
        const thickness = parseInt(p[2]) || 3;
        // Detect line vs box: if height equals thickness (or is very small), it's a line
        if (h <= thickness + 1) {
          elements.push({ elementType: 'line', x, y, width: w, height: thickness });
        } else if (w <= thickness + 1) {
          elements.push({ elementType: 'line', x, y, width: thickness, height: h, vertical: true });
        } else {
          elements.push({ elementType: 'box', x, y, width: w, height: h, strokeWidth: thickness });
        }
        pendingBarcode = null;
        break;
      }

      case 'GD': {
        // Diagonal line — approximate as a box with same footprint
        const w = parseInt(p[0]) || 50;
        const h = parseInt(p[1]) || 50;
        const thickness = parseInt(p[2]) || 3;
        elements.push({ elementType: 'box', x, y, width: w, height: h, strokeWidth: thickness });
        break;
      }

      // ── Field hex indicator ───────────────────────────────────────────────
      case 'FH':
        fieldHex = true;
        break;

      // ── Field data → create element ───────────────────────────────────────
      case 'FD': {
        let data = raw; // preserve raw content including commas

        // Decode ^FH hex escapes: _xx → character
        if (fieldHex) {
          data = data.replace(/_([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        }

        data = data.trim();
        if (!data) break;

        if (pendingBarcode?.type === 'qrcode') {
          // QR ^FD may be prefixed with error-correction designator, e.g. "MA," or "QA,"
          let qrData = data;
          if (/^[A-Z]{1,2}[A-Z],/i.test(qrData)) {
            qrData = qrData.replace(/^[A-Z]{1,2}[A-Z],/i, '');
          }
          elements.push({
            elementType: 'qrcode',
            x, y,
            barcodeData: qrData,
            magnification: pendingBarcode.magnification,
          });
        } else if (pendingBarcode) {
          elements.push({
            elementType: 'barcode',
            x, y,
            barcodeType: pendingBarcode.type,
            barcodeData: data,
            barcodeHeight: pendingBarcode.height,
            moduleWidth: pendingBarcode.moduleWidth,
            showText: pendingBarcode.showText,
          });
        } else {
          elements.push({
            elementType: 'text',
            x, y,
            text: data,
            fontSize: fontHeight,
          });
        }

        pendingBarcode = null;
        fieldHex = false;
        break;
      }

      case 'FS':
        pendingBarcode = null;
        fieldHex = false;
        break;

      // everything else is intentionally ignored
    }
  }

  return { elements, labelWidthDots, labelHeightDots };
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

/**
 * Split a ZPL string into { cmd, raw } tokens.
 * Command code = the 2 characters immediately after ^  (first=letter, second=letter|digit).
 * Raw = everything up to the next ^ command or end of string.
 */
function tokenize(zpl) {
  const tokens = [];
  // Lookahead stops at the next ^[A-Z] (start of next command)
  const re = /\^([A-Z][A-Z0-9])(.*?)(?=\^[A-Z~]|$)/gs;
  let m;
  while ((m = re.exec(zpl)) !== null) {
    tokens.push({ cmd: m[1].toUpperCase(), raw: m[2] });
  }
  return tokens;
}
