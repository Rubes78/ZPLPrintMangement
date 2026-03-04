/**
 * Generate ZPL code from Fabric.js canvas objects.
 *
 * Coordinate system: canvas units = ZPL dots (1:1).
 * Rotation: Fabric.js degrees → ZPL rotation characters (N/R/I/B).
 *
 * Template variables: {{name}} in text/barcode data are substituted
 * with provided values before outputting ZPL.
 */
import { imageObjectToGFA } from './imageToGfa.js';

const ROTATION_MAP = { 0: 'N', 90: 'R', 180: 'I', 270: 'B' };

function fabricAngleToZpl(angle) {
  const norm = ((Math.round(angle) % 360) + 360) % 360;
  if (norm < 45 || norm >= 315) return 'N';
  if (norm < 135) return 'R';
  if (norm < 225) return 'I';
  return 'B';
}

function applyVars(text = '', vars = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function round(n) {
  return Math.max(0, Math.round(n));
}

const MEDIA_TYPE_NAMES   = { T: 'Thermal Transfer (ribbon)', D: 'Direct Thermal (no ribbon)' };
const SENSING_NAMES      = { Y: 'Gap / Web (die-cut)', M: 'Black Mark', N: 'Continuous', A: 'Auto-detect', W: 'Continuous variable-length' };
const PRINT_MODE_NAMES   = { T: 'Tear-off', P: 'Peel-off', R: 'Rewind', C: 'Cutter', A: 'Applicator' };
const MEDIA_FEED_NAMES   = { FF: 'Feed → Feed', RF: 'Retract then Feed (backfeed before print)', NF: 'No motion → Feed', FN: 'Feed → No motion', FO: 'Feed → Feed out (present label)', RR: 'Retract → Retract' };

function cx(comment) { return `^FX ${comment}^FS\n`; }

export function generateZpl(objects, labelSettings, templateVars = {}) {
  const {
    widthInches = 4, heightInches = 6, dpi = 203, copies = 1,
    darkness, printSpeed, mediaType, mediaSensing, printMode,
    mediaFeed, labelTop, labelShift, tearOff, extraCmds,
  } = labelSettings;
  const widthDots = round(widthInches * dpi);
  const heightDots = round(heightInches * dpi);

  // Persistent tilde commands — go BEFORE ^XA, affect printer globally
  let pre = '';
  if (darkness != null && darkness !== '') {
    pre += cx(`Darkness: ${darkness}/30  (0=lightest, 30=darkest)  [persistent]`);
    pre += `~SD${String(round(+darkness)).padStart(2, '0')}\n`;
  }

  let zpl = `${pre}^XA\n`;
  zpl += cx(`Label: ${widthInches}" × ${heightInches}"  |  ${dpi} DPI  |  ${widthDots} × ${heightDots} dots`);
  zpl += `^PW${widthDots}\n^LL${heightDots}\n^LH0,0\n`;

  // Label-scoped printer commands (inside ^XA…^XZ)
  if (printSpeed != null && printSpeed !== '') {
    zpl += cx(`Print Speed: ${printSpeed} ips  (^PR)`);
    zpl += `^PR${round(+printSpeed)}\n`;
  }
  if (mediaType) {
    zpl += cx(`Media Type: ${MEDIA_TYPE_NAMES[mediaType] || mediaType}  (^MT)`);
    zpl += `^MT${mediaType}\n`;
  }
  if (mediaSensing) {
    zpl += cx(`Sensing: ${SENSING_NAMES[mediaSensing] || mediaSensing}  (^MN)`);
    zpl += `^MN${mediaSensing}\n`;
  }
  if (printMode) {
    zpl += cx(`Print Mode: ${PRINT_MODE_NAMES[printMode] || printMode}  (^MM)`);
    zpl += `^MM${printMode}\n`;
  }
  if (mediaFeed) {
    zpl += cx(`Feed / Backfeed: ${MEDIA_FEED_NAMES[mediaFeed] || mediaFeed}  (^MF)`);
    zpl += `^MF${mediaFeed}\n`;
  }
  if (labelTop != null && labelTop !== '') {
    zpl += cx(`Label Top offset: ${labelTop} dots — shifts content up/down  (^LT)`);
    zpl += `^LT${Math.round(+labelTop)}\n`;
  }
  if (labelShift != null && labelShift !== '') {
    zpl += cx(`Label Shift: ${labelShift} dots — shifts content left/right  (^LS)`);
    zpl += `^LS${Math.round(+labelShift)}\n`;
  }
  if (tearOff != null && tearOff !== '') {
    zpl += cx(`Tear-off position: ${tearOff} dots  (^TA)`);
    zpl += `^TA${Math.round(+tearOff)}\n`;
  }
  if (extraCmds?.trim()) {
    zpl += cx(`Extra commands (user-defined)`);
    zpl += `${extraCmds.trim()}\n`;
  }

  if (objects.filter((o) => o.visible && o.elementType).length > 0) {
    zpl += cx(`─── Label Content ───────────────────────────────────`);
  }

  for (const obj of objects) {
    if (!obj.visible) continue;
    const type = obj.elementType;
    if (!type) continue;

    const x = round(obj.left);
    const y = round(obj.top);
    const rot = fabricAngleToZpl(obj.angle || 0);

    switch (type) {
      case 'text':
        zpl += generateText(obj, x, y, rot, templateVars, widthDots);
        break;
      case 'barcode':
        zpl += generateBarcode(obj, x, y, rot, templateVars);
        break;
      case 'qrcode':
        zpl += generateQr(obj, x, y, rot, templateVars);
        break;
      case 'box':
        zpl += generateBox(obj, x, y);
        break;
      case 'line':
        zpl += generateLine(obj, x, y);
        break;
      case 'image':
        zpl += generateImage(obj, x, y);
        break;
    }
  }

  if (copies > 1) zpl += `^PQ${copies},0,1,Y\n`;
  zpl += `^XZ`;
  return zpl;
}

function generateText(obj, x, y, rot, vars, labelWidth) {
  const text = applyVars(obj.text || '', vars);
  const charH = round((obj.fontSize || 30) * (obj.scaleY || 1));
  const align = obj.zplTextAlign || 'L';
  // ^A0 = scalable ZPL font; 0 width = auto (maintains aspect ratio)
  if ((align === 'C' || align === 'R') && labelWidth) {
    // ^FB lets the printer handle alignment using its own font metrics,
    // which avoids off-center prints caused by canvas vs. printer font differences.
    return `^FO0,${y}^A0${rot},${charH},0^FB${labelWidth},1,0,${align},0^FH^FD${text}^FS\n`;
  }
  return `^FO${x},${y}^A0${rot},${charH},0^FH^FD${text}^FS\n`;
}

function generateBarcode(obj, x, y, rot, vars) {
  const data = applyVars(obj.barcodeData || '', vars);
  const bh = round((obj.barcodeHeight || 80) * (obj.scaleY || 1));
  const mw = obj.moduleWidth || 2;
  const showText = obj.showText !== false ? 'Y' : 'N';

  switch (obj.barcodeType) {
    case 'code39':
      // ^B3 = Code 39; N=normal rotation, N=no check digit, height, Y=print text, N=text above
      return `^FO${x},${y}^BY${mw},3,${bh}^B3${rot},N,${bh},${showText},N^FD${data}^FS\n`;
    case 'code128':
    default:
      // ^BC = Code 128; rotation, height, Y=text, N=text above, N=UCC
      return `^FO${x},${y}^BY${mw},3,${bh}^BC${rot},${bh},${showText},N,N^FD${data}^FS\n`;
  }
}

function generateQr(obj, x, y, rot, vars) {
  const data = applyVars(obj.barcodeData || '', vars);
  const mag = obj.magnification || 4;
  // ^BQ takes only 3 params: orientation, model 2, magnification.
  // ^FD data MUST be prefixed with "MA," — error correction M, auto mask —
  // otherwise the printer interprets the leading data bytes as control bytes
  // and silently drops them (causing truncated scans).
  return `^FO${x},${y}^BQ${rot},2,${mag}^FDMA,${data}^FS\n`;
}

function generateBox(obj, x, y) {
  const w = round((obj.width || 100) * (obj.scaleX || 1));
  const h = round((obj.height || 100) * (obj.scaleY || 1));
  const thickness = round(obj.strokeWidth || 3);
  // ^GB: width, height, border thickness, color (B/W), corner rounding 0
  return `^FO${x},${y}^GB${w},${h},${thickness}^FS\n`;
}

function generateLine(obj, x, y) {
  const w = round((obj.width || 100) * (obj.scaleX || 1));
  const h = round((obj.height || 3) * (obj.scaleY || 1));
  const thickness = Math.max(1, h); // the line IS the thickness
  return `^FO${x},${y}^GB${w},${thickness},${thickness}^FS\n`;
}

function generateImage(obj, x, y) {
  try {
    const gfa = imageObjectToGFA(obj);
    if (!gfa) return '';
    return `^FO${x},${y}${gfa}^FS\n`;
  } catch (e) {
    console.error('Image GFA conversion failed:', e);
    return '';
  }
}

/**
 * Extract template variable names ({{name}}) from ZPL or from canvas objects.
 */
export function extractTemplateVars(objects) {
  const vars = new Set();
  const re = /\{\{(\w+)\}\}/g;
  for (const obj of objects) {
    for (const field of [obj.text, obj.barcodeData]) {
      if (field) {
        let m;
        while ((m = re.exec(field)) !== null) vars.add(m[1]);
      }
    }
  }
  return [...vars];
}
