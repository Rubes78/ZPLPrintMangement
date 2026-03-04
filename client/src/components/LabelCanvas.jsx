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
  'barcodeHeight', 'moduleWidth', 'showText', 'magnification', 'zplFontHeight', 'zplTextAlign', 'locked',
];

const GRID_SIZE = 10; // dots

const LabelCanvas = forwardRef(function LabelCanvas(
  { labelWidthDots, labelHeightDots, zoom, onObjectSelected, onObjectDeselected, onCanvasChanged, snapEnabled, onToggleSnap },
  ref
) {
  const canvasElRef = useRef(null);
  const fc = useRef(null); // Fabric.js Canvas instance
  const historyRef = useRef([]); // undo stack (JSON snapshots)
  const redoRef = useRef([]);
  const snapRef = useRef(snapEnabled);

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

    // Snap to grid while dragging
    canvas.on('object:moving', (e) => {
      if (!snapRef.current) return;
      const obj = e.target;
      obj.set({
        left: Math.round(obj.left / GRID_SIZE) * GRID_SIZE,
        top:  Math.round(obj.top  / GRID_SIZE) * GRID_SIZE,
      });
    });

    // Draw grid overlay after each render
    canvas.on('after:render', () => {
      if (!snapRef.current) return;
      const ctx = canvas.getContext();
      const z = canvas.getZoom();
      const w = canvas.width;
      const h = canvas.height;
      const step = GRID_SIZE * z;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();
    });

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

  // ── Sync snap toggle (no canvas re-init needed) ───────────────────────────
  useEffect(() => {
    snapRef.current = snapEnabled;
    fc.current?.renderAll();
  }, [snapEnabled]);

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

  // ── Alignment ─────────────────────────────────────────────────────────────
  function align(direction) {
    const canvas = fc.current;
    const active = canvas.getActiveObject();
    if (!active) return;

    const labelW = labelWidthDots;
    const labelH = labelHeightDots;

    function applyAlign(obj, w, h) {
      switch (direction) {
        case 'left':    obj.set({ left: 0 }); break;
        case 'centerH': obj.set({ left: Math.round((labelW - w) / 2) }); break;
        case 'right':   obj.set({ left: labelW - w }); break;
        case 'top':     obj.set({ top: 0 }); break;
        case 'middleV': obj.set({ top: Math.round((labelH - h) / 2) }); break;
        case 'bottom':  obj.set({ top: labelH - h }); break;
      }
      // For text objects, sync zplTextAlign so the ZPL uses ^FB for printer-side alignment
      if (obj.elementType === 'text') {
        if (direction === 'left')    obj.set({ zplTextAlign: 'L' });
        if (direction === 'centerH') obj.set({ zplTextAlign: 'C' });
        if (direction === 'right')   obj.set({ zplTextAlign: 'R' });
      }
      obj.setCoords();
    }

    if (active.type === 'activeSelection') {
      const selected = active.getObjects().slice();
      canvas.discardActiveObject();
      selected.forEach(obj => applyAlign(obj, obj.getScaledWidth(), obj.getScaledHeight()));
      const sel = new fabric.ActiveSelection(selected, { canvas });
      canvas.setActiveObject(sel);
    } else {
      applyAlign(active, active.getScaledWidth(), active.getScaledHeight());
    }

    canvas.renderAll();
    onCanvasChanged(canvas.getObjects());
  }

  // ── Z-order ───────────────────────────────────────────────────────────────
  function bringForward() {
    const canvas = fc.current;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type === 'activeSelection') return;
    canvas.bringForward(obj);
    canvas.renderAll();
    onCanvasChanged(canvas.getObjects());
  }

  function sendBackward() {
    const canvas = fc.current;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type === 'activeSelection') return;
    canvas.sendBackwards(obj);
    canvas.renderAll();
    onCanvasChanged(canvas.getObjects());
  }

  // ── Locking ───────────────────────────────────────────────────────────────
  function toggleLock() {
    const canvas = fc.current;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type === 'activeSelection') return;
    const locked = !obj.locked;
    obj.set({
      locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
    });
    canvas.renderAll();
    onObjectSelected({ ...obj });
    onCanvasChanged(canvas.getObjects());
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

    align,
    bringForward,
    sendBackward,
    toggleLock,

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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar — static header row, no absolute positioning needed */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-900 border-b border-slate-700 shrink-0">
        {[
          { dir: 'left',    title: 'Align left',          svg: 'M3 5h12M3 9h8M3 13h12M3 17h8M3 3v18' },
          { dir: 'centerH', title: 'Center horizontally', svg: 'M12 3v18M5 7h14M8 12h8M5 17h14' },
          { dir: 'right',   title: 'Align right',         svg: 'M21 5H9M21 9h-8M21 13H9M21 17h-8M21 3v18' },
        ].map(({ dir, title, svg }) => (
          <AlignBtn key={dir} title={title} onClick={() => align(dir)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
              <path d={svg} />
            </svg>
          </AlignBtn>
        ))}
        <div className="w-px h-4 bg-slate-600 mx-0.5" />
        {[
          { dir: 'top',     title: 'Align top',         svg: 'M5 3h14M7 3v12M12 3v8M17 3v12M3 3h18' },
          { dir: 'middleV', title: 'Center vertically', svg: 'M3 12h18M7 5v14M12 8v8M17 5v14' },
          { dir: 'bottom',  title: 'Align bottom',      svg: 'M5 21h14M7 21V9M12 21v-8M17 21V9M3 21h18' },
        ].map(({ dir, title, svg }) => (
          <AlignBtn key={dir} title={title} onClick={() => align(dir)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
              <path d={svg} />
            </svg>
          </AlignBtn>
        ))}
        <div className="w-px h-4 bg-slate-600 mx-0.5" />
        <AlignBtn title="Bring forward (raise one layer)" onClick={bringForward}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <rect x="3" y="7" width="11" height="11" rx="1"/><rect x="10" y="4" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.3"/>
            <path d="M15 4v3M20 9h-3"/>
          </svg>
        </AlignBtn>
        <AlignBtn title="Send backward (lower one layer)" onClick={sendBackward}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <rect x="10" y="7" width="11" height="11" rx="1"/><rect x="3" y="4" width="11" height="11" rx="1" fill="currentColor" fillOpacity="0.3"/>
            <path d="M9 15v3M4 20h3"/>
          </svg>
        </AlignBtn>

        <button
          onClick={onToggleSnap}
          title={snapEnabled ? 'Snap to grid: ON — click to disable' : 'Snap to grid: OFF — click to enable'}
          className={`ml-auto text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
            snapEnabled
              ? 'bg-blue-700 border-blue-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}`}>
          {snapEnabled ? '⊞ Grid ON' : '⊞ Grid OFF'}
        </button>
      </div>

      {/* Canvas scroll area — label centered, darker bg makes it pop */}
      <div className="flex-1 overflow-auto bg-[#111318]">
        <div className="min-h-full flex items-center justify-center p-6">
          <div style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }} className="shrink-0">
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default LabelCanvas;

function AlignBtn({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-400
                 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-colors">
      {children}
    </button>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
