import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { fabric } from 'fabric';
import {
  createTextElement,
  createBarcodeElement,
  createQrElement,
  createBoxElement,
  createLineElement,
  createImageElement,
} from '../lib/elementFactory.js';

const CUSTOM_PROPS = [
  'elementType', 'barcodeType', 'barcodeData', 'fieldName',
  'barcodeHeight', 'moduleWidth', 'showText', 'magnification', 'zplFontHeight',
];

const LabelCanvas = forwardRef(function LabelCanvas(
  { labelWidthDots, labelHeightDots, zoom, onObjectSelected, onObjectDeselected, onCanvasChanged },
  ref
) {
  const canvasElRef = useRef(null);
  const fc = useRef(null); // Fabric.js Canvas instance
  const historyRef = useRef([]); // undo stack (JSON snapshots)
  const redoRef = useRef([]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: Math.round(labelWidthDots * zoom),
      height: Math.round(labelHeightDots * zoom),
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    });
    canvas.setZoom(zoom);
    fc.current = canvas;

    const snap = () => snapshot(canvas);

    canvas.on('selection:created', (e) => {
      if (e.selected?.length === 1) onObjectSelected(e.selected[0]);
    });
    canvas.on('selection:updated', (e) => {
      if (e.selected?.length === 1) onObjectSelected(e.selected[0]);
    });
    canvas.on('selection:cleared', () => onObjectDeselected());

    // Notify parent on any canvas change
    const notify = () => onCanvasChanged(canvas.getObjects());
    canvas.on('object:modified', () => { snap(); notify(); });
    canvas.on('object:added', () => { snap(); notify(); });
    canvas.on('object:removed', () => { snap(); notify(); });
    canvas.on('text:changed', notify); // live while editing

    // Keyboard shortcuts
    const onKey = (e) => {
      const active = canvas.getActiveObject();
      if (!active) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!active.isEditing) {
          canvas.remove(active);
          canvas.discardActiveObject();
          canvas.renderAll();
          onObjectDeselected();
          notify();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo(canvas, notify);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Zoom / size changes ───────────────────────────────────────────────────
  useEffect(() => {
    if (!fc.current) return;
    fc.current.setZoom(zoom);
    fc.current.setDimensions({
      width: Math.round(labelWidthDots * zoom),
      height: Math.round(labelHeightDots * zoom),
    });
    fc.current.renderAll();
  }, [zoom, labelWidthDots, labelHeightDots]);

  // ── Snapshot helpers for undo ─────────────────────────────────────────────
  function snapshot(canvas) {
    const json = canvas.toJSON(CUSTOM_PROPS);
    historyRef.current.push(JSON.stringify(json));
    if (historyRef.current.length > 30) historyRef.current.shift();
    redoRef.current = [];
  }

  function undo(canvas, notify) {
    if (historyRef.current.length < 2) return;
    const current = historyRef.current.pop();
    redoRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    canvas.loadFromJSON(JSON.parse(prev), () => {
      canvas.renderAll();
      notify();
    });
  }

  // ── Center point for adding elements ─────────────────────────────────────
  function centerPoint() {
    return {
      left: Math.round(fc.current.width / fc.current.getZoom() / 2) - 100,
      top: Math.round(fc.current.height / fc.current.getZoom() / 2) - 50,
    };
  }

  function addAndSelect(obj) {
    fc.current.add(obj);
    fc.current.setActiveObject(obj);
    fc.current.renderAll();
    onObjectSelected(obj);
    onCanvasChanged(fc.current.getObjects());
  }

  // ── Exposed API ───────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    addText() {
      const obj = createTextElement(centerPoint());
      addAndSelect(obj);
    },

    addTextField({ text }) {
      const obj = createTextElement(centerPoint());
      obj.set({ text });
      addAndSelect(obj);
    },

    async addBarcode(barcodeType, opts = {}) {
      const obj = await createBarcodeElement({ ...centerPoint(), barcodeType, ...opts });
      addAndSelect(obj);
    },

    async addQrCode(opts = {}) {
      const cp = centerPoint();
      const obj = await createQrElement({ left: cp.left, top: cp.top, ...opts });
      addAndSelect(obj);
    },

    addBox() {
      addAndSelect(createBoxElement(centerPoint()));
    },

    addLine() {
      addAndSelect(createLineElement(centerPoint()));
    },

    async addImage(file) {
      const dataUrl = await readFileAsDataUrl(file);
      const obj = await createImageElement(dataUrl, centerPoint());
      addAndSelect(obj);
    },

    deleteSelected() {
      const active = fc.current.getActiveObject();
      if (active && !active.isEditing) {
        fc.current.remove(active);
        fc.current.discardActiveObject();
        fc.current.renderAll();
        onObjectDeselected();
        onCanvasChanged(fc.current.getObjects());
      }
    },

    /** Update properties of the currently selected object in place. */
    updateSelected(props) {
      const active = fc.current.getActiveObject();
      if (!active) return;
      active.set(props);
      fc.current.renderAll();
      onObjectSelected({ ...active }); // trigger re-render of props panel
      onCanvasChanged(fc.current.getObjects());
    },

    /** Replace a barcode/QR image object with a re-rendered version. */
    async rebuildBarcode(newProps) {
      const active = fc.current.getActiveObject();
      if (!active) return;

      const { left, top, scaleX, scaleY, angle } = active;
      const merged = {
        left, top, scaleX, scaleY, angle,
        barcodeType: active.barcodeType,
        barcodeData: active.barcodeData,
        barcodeHeight: active.barcodeHeight,
        moduleWidth: active.moduleWidth,
        showText: active.showText,
        magnification: active.magnification,
        fieldName: active.fieldName,
        elementType: active.elementType,
        ...newProps,
      };

      fc.current.remove(active);

      let newObj;
      if (merged.elementType === 'qrcode') {
        newObj = await createQrElement(merged);
      } else {
        newObj = await createBarcodeElement(merged);
      }

      addAndSelect(newObj);
    },

    getObjects() {
      return fc.current.getObjects();
    },

    getJSON() {
      return fc.current.toJSON(CUSTOM_PROPS);
    },

    loadJSON(json) {
      fc.current.loadFromJSON(json, () => {
        fc.current.renderAll();
        onCanvasChanged(fc.current.getObjects());
      });
    },

    /**
     * Reconstruct canvas from an array of parsed element descriptors.
     * Clears existing content first.
     */
    async importFromParsed(parsedElements) {
      fc.current.clear();
      fc.current.backgroundColor = '#ffffff';

      for (const el of parsedElements) {
        let obj;
        try {
          switch (el.elementType) {
            case 'text':
              obj = createTextElement({ left: el.x, top: el.y });
              obj.set({ text: el.text || 'Text', fontSize: el.fontSize || 30 });
              fc.current.add(obj);
              break;

            case 'barcode':
              obj = await createBarcodeElement({
                left: el.x,
                top: el.y,
                barcodeType: el.barcodeType,
                barcodeData: el.barcodeData || '000000',
                barcodeHeight: el.barcodeHeight || 80,
                moduleWidth: el.moduleWidth || 2,
                showText: el.showText !== false,
              });
              fc.current.add(obj);
              break;

            case 'qrcode':
              obj = await createQrElement({
                left: el.x,
                top: el.y,
                barcodeData: el.barcodeData || 'ERROR',
                magnification: el.magnification || 4,
              });
              fc.current.add(obj);
              break;

            case 'box':
              obj = createBoxElement({ left: el.x, top: el.y, width: el.width || 100, height: el.height || 100 });
              obj.set({ strokeWidth: el.strokeWidth || 3 });
              fc.current.add(obj);
              break;

            case 'line':
              obj = createLineElement({ left: el.x, top: el.y, width: el.width || 100 });
              obj.set({ height: Math.max(1, el.height || 3) });
              fc.current.add(obj);
              break;
          }
        } catch (err) {
          console.warn('Failed to create element from parsed ZPL:', el, err);
        }
      }

      fc.current.discardActiveObject();
      fc.current.renderAll();
      onObjectDeselected();
      onCanvasChanged(fc.current.getObjects());
    },

    /**
     * Rotate all canvas elements 90° and update their positions/dimensions
     * so they fit correctly in the swapped label dimensions.
     *
     * direction: 'cw'  (portrait → landscape) or 'ccw' (landscape → portrait)
     * oldWidthDots / oldHeightDots: label dimensions BEFORE the swap.
     *
     * Rotation formulas (top-left origin, all values in dots):
     *   CW:  newX = oldH − oldY − objH,  newY = oldX
     *   CCW: newX = oldY,                 newY = oldW − oldX − objW
     * Rects (box/line): dimensions swap; angle stays 0.
     * All other elements: position updates + angle += 90° (CW) or −90° (CCW).
     */
    rotateAll90(direction, oldWidthDots, oldHeightDots) {
      const objects = fc.current.getObjects();

      for (const obj of objects) {
        const objW = (obj.width  || 0) * (obj.scaleX || 1);
        const objH = (obj.height || 0) * (obj.scaleY || 1);
        const oldX = obj.left || 0;
        const oldY = obj.top  || 0;

        let newX, newY;
        if (direction === 'cw') {
          newX = oldHeightDots - oldY - objH;
          newY = oldX;
        } else {
          newX = oldY;
          newY = oldWidthDots - oldX - objW;
        }

        if (obj.elementType === 'box' || obj.elementType === 'line') {
          // For rectangles, swap width/height instead of rotating the shape.
          // Reset scale to 1 and absorb the actual size into width/height.
          obj.set({
            left:   newX,
            top:    newY,
            width:  objH,
            height: objW,
            scaleX: 1,
            scaleY: 1,
          });
        } else {
          // Text, barcodes, images — update position and rotate the element itself.
          const angleDelta = direction === 'cw' ? 90 : -90;
          obj.set({
            left:  newX,
            top:   newY,
            angle: ((obj.angle || 0) + angleDelta + 360) % 360,
          });
        }
      }

      fc.current.discardActiveObject();
      fc.current.renderAll();
      onObjectDeselected();
      onCanvasChanged(fc.current.getObjects());
    },

    clearAll() {
      fc.current.clear();
      fc.current.backgroundColor = '#ffffff';
      fc.current.renderAll();
      onObjectDeselected();
      onCanvasChanged([]);
    },

    fitZoom() {
      return { widthDots: labelWidthDots, heightDots: labelHeightDots };
    },
  }));

  return (
    <div className="flex-1 canvas-scroll-area overflow-auto flex items-start justify-start p-8">
      <div
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}
        className="shrink-0"
      >
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
});

export default LabelCanvas;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
