/**
 * Factory functions for creating Fabric.js canvas elements.
 * Canvas coordinate system: 1 unit = 1 ZPL dot.
 * Barcodes and QR codes are rendered as Image objects for display,
 * but generate native ZPL barcode commands for output.
 */
import { fabric } from 'fabric';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

// ── Text ─────────────────────────────────────────────────────────────────────
export function createTextElement({ left = 50, top = 50 } = {}) {
  const obj = new fabric.IText('New Text', {
    left,
    top,
    fontSize: 30,
    fontFamily: 'Courier New, monospace',
    fill: '#000000',
    editable: true,
    // Custom ZPL properties
    elementType: 'text',
    fieldName: '',
    zplFontHeight: 30,
    zplTextAlign: 'L', // L=left, C=center, R=right — controls ^FB in ZPL output
  });
  extendToObject(obj, ['elementType', 'fieldName', 'zplFontHeight', 'zplTextAlign']);
  return obj;
}

// ── Code 128 / Code 39 barcode ───────────────────────────────────────────────
export async function createBarcodeElement({
  left = 50,
  top = 50,
  barcodeType = 'code128',
  barcodeData = '123456789',
  barcodeHeight = 80,
  moduleWidth = 2,
  showText = true,
  scaleX = 1,
  scaleY = 1,
  angle = 0,
} = {}) {
  const tempCanvas = document.createElement('canvas');
  const format = barcodeType === 'code39' ? 'CODE39' : 'CODE128';

  try {
    JsBarcode(tempCanvas, barcodeData || '000000', {
      format,
      width: moduleWidth,
      height: barcodeHeight,
      displayValue: showText,
      fontSize: 14,
      margin: 4,
      background: '#ffffff',
    });
  } catch {
    JsBarcode(tempCanvas, 'ERROR', {
      format: 'CODE128',
      width: moduleWidth,
      height: barcodeHeight,
      displayValue: false,
      background: '#ffffff',
    });
  }

  return new Promise((resolve) => {
    fabric.Image.fromURL(tempCanvas.toDataURL(), (img) => {
      img.set({ left, top, scaleX, scaleY, angle });
      setCustomProps(img, {
        elementType: 'barcode',
        barcodeType,
        barcodeData,
        barcodeHeight,
        moduleWidth,
        showText,
      });
      extendToObject(img, ['elementType', 'barcodeType', 'barcodeData', 'barcodeHeight', 'moduleWidth', 'showText', 'fieldName']);
      resolve(img);
    });
  });
}

// ── QR Code ──────────────────────────────────────────────────────────────────
export async function createQrElement({
  left = 50,
  top = 50,
  barcodeData = 'https://example.com',
  magnification = 4,
  scaleX = 1,
  scaleY = 1,
  angle = 0,
} = {}) {
  const size = Math.max(50, magnification * 25);
  const tempCanvas = document.createElement('canvas');

  try {
    await QRCode.toCanvas(tempCanvas, barcodeData || 'ERROR', {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    await QRCode.toCanvas(tempCanvas, 'ERROR', {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  return new Promise((resolve) => {
    fabric.Image.fromURL(tempCanvas.toDataURL(), (img) => {
      img.set({ left, top, scaleX, scaleY, angle });
      setCustomProps(img, {
        elementType: 'qrcode',
        barcodeType: 'qrcode',
        barcodeData,
        magnification,
        barcodeHeight: size,
        moduleWidth: magnification,
        showText: false,
        fieldName: '',
      });
      extendToObject(img, ['elementType', 'barcodeType', 'barcodeData', 'magnification', 'barcodeHeight', 'moduleWidth', 'showText', 'fieldName']);
      resolve(img);
    });
  });
}

// ── Box (outline rectangle) ──────────────────────────────────────────────────
export function createBoxElement({ left = 50, top = 50, width = 200, height = 100 } = {}) {
  const obj = new fabric.Rect({
    left,
    top,
    width,
    height,
    fill: 'transparent',
    stroke: '#000000',
    strokeWidth: 3,
    strokeUniform: true,
    elementType: 'box',
    fieldName: '',
  });
  extendToObject(obj, ['elementType', 'fieldName']);
  return obj;
}

// ── Line (thin filled rectangle = ZPL ^GB line) ──────────────────────────────
export function createLineElement({ left = 50, top = 50, width = 200 } = {}) {
  const obj = new fabric.Rect({
    left,
    top,
    width,
    height: 3,
    fill: '#000000',
    stroke: 'transparent',
    strokeWidth: 0,
    elementType: 'line',
    fieldName: '',
  });
  extendToObject(obj, ['elementType', 'fieldName']);
  return obj;
}

// ── Image (user-uploaded, converts to ^GFA) ──────────────────────────────────
export function createImageElement(dataUrl, { left = 50, top = 50 } = {}) {
  return new Promise((resolve) => {
    fabric.Image.fromURL(dataUrl, (img) => {
      // Scale down if too large
      if (img.width > 300) img.scaleToWidth(300);
      img.set({ left, top });
      setCustomProps(img, { elementType: 'image', fieldName: '' });
      extendToObject(img, ['elementType', 'fieldName']);
      resolve(img);
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function setCustomProps(obj, props) {
  Object.assign(obj, props);
}

/**
 * Patch toObject() on a specific Fabric.js instance so custom properties
 * survive canvas.toJSON() serialization.
 */
function extendToObject(obj, extraProps) {
  const origToObject = obj.toObject.bind(obj);
  obj.toObject = function (additional = []) {
    return origToObject([...extraProps, ...additional]);
  };
}
