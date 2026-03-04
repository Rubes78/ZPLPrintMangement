import React, { useState, useRef, useCallback, useEffect } from 'react';
import Header from './components/Header.jsx';
import ElementPalette from './components/ElementPalette.jsx';
import LabelCanvas from './components/LabelCanvas.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import ZplPanel from './components/ZplPanel.jsx';
import PrintDialog from './components/PrintDialog.jsx';
import PrinterSettings from './components/PrinterSettings.jsx';
import LabelLibrary from './components/LabelLibrary.jsx';
import { generateZpl } from './lib/zplGenerator.js';
import { parseZpl } from './lib/zplParser.js';
import LabelSummary from './components/LabelSummary.jsx';
import HelpModal from './components/HelpModal.jsx';

const DEFAULT_SETTINGS = {
  labelName: 'New Label',
  widthInches: 1,
  heightInches: 2,
  dpi: 203,
  // Printer commands — null means omit (use printer's current setting)
  darkness: null,      // ~SD  0–30
  printSpeed: null,    // ^PR  1–14 ips
  mediaType: null,     // ^MT  'T'=thermal transfer | 'D'=direct thermal
  mediaSensing: null,  // ^MN  'Y'=gap | 'M'=black mark | 'N'=continuous | 'A'=auto
  printMode: null,     // ^MM  'T'=tear-off | 'P'=peel | 'R'=rewind | 'C'=cutter
  mediaFeed: null,     // ^MF  e.g. 'FF','RF','NF' (feed,backfeed chars)
  labelTop: null,      // ^LT  −120…120 dots
  labelShift: null,    // ^LS  −9999…9999 dots (left/right offset)
  tearOff: null,       // ^TA  −120…120 dots
  extraCmds: '',       // raw ZPL injected inside ^XA after header commands
};

const STORAGE_KEY = 'zpl-editor-state';

export default function App() {
  const canvasRef = useRef(null);

  const [labelSettings, setLabelSettings] = useState(DEFAULT_SETTINGS);
  const [selectedObject, setSelectedObject] = useState(null);
  const [canvasObjects, setCanvasObjects] = useState([]);
  const [zplCode, setZplCode] = useState('');
  const [zoom, setZoom] = useState(0.5);
  const [printOpen, setPrintOpen]       = useState(false);
  const [printersOpen, setPrintersOpen] = useState(false);
  const [libraryOpen, setLibraryOpen]   = useState(false);
  const [currentLabelId, setCurrentLabelId] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [propertiesTab, setPropertiesTab] = useState('label'); // 'text' | 'label'
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  // Compute label dimensions in dots
  const labelWidthDots = Math.round(labelSettings.widthInches * labelSettings.dpi);
  const labelHeightDots = Math.round(labelSettings.heightInches * labelSettings.dpi);

  // Auto-fit zoom when label size changes
  useEffect(() => {
    // Available canvas area is roughly viewport minus sidebar/panels
    const availW = window.innerWidth - 172 - 380 - 48; // palette + right panel + padding
    const availH = window.innerHeight - 48 - 16; // header + padding
    const fitZoom = Math.min(availW / labelWidthDots, availH / labelHeightDots, 1) * 0.95;
    setZoom(Math.max(0.1, parseFloat(fitZoom.toFixed(2))));
  }, [labelSettings.dpi, labelSettings.widthInches, labelSettings.heightInches]);

  // Regenerate ZPL whenever canvas objects change
  const handleCanvasChanged = useCallback((objects) => {
    setCanvasObjects(objects);
    const zpl = generateZpl(objects, labelSettings);
    setZplCode(zpl);
    setIsDirty(true);
  }, [labelSettings]);

  // Regenerate ZPL when label settings change (without canvas change)
  useEffect(() => {
    const zpl = generateZpl(canvasObjects, labelSettings);
    setZplCode(zpl);
  }, [labelSettings]);

  function handleSettingsChange(patch) {
    setLabelSettings((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }

  // ── Canvas interaction handlers ───────────────────────────────────────────
  function handleAdd(type, extra) {
    if (!canvasRef.current) return;
    switch (type) {
      case 'text':      return canvasRef.current.addText();
      case 'code128':   return canvasRef.current.addBarcode('code128');
      case 'code39':    return canvasRef.current.addBarcode('code39');
      case 'qrcode':    return canvasRef.current.addQrCode();
      case 'box':       return canvasRef.current.addBox();
      case 'line':      return canvasRef.current.addLine();
      case 'image':     return extra && canvasRef.current.addImage(extra);
      case 'variable': {
        const prefix = extra.toLowerCase() === 'price' ? '$' : '';
        return canvasRef.current.addTextField({ text: `${prefix}{{${extra}}}` });
      }
      case 'variable-barcode':
        if (extra === 'qrcode') return canvasRef.current.addQrCode({ barcodeData: '{{barcode}}' });
        return canvasRef.current.addBarcode(extra, { barcodeData: '{{barcode}}', showText: false });
    }
  }

  function handleObjectSelected(obj) {
    setSelectedObject(obj ? { ...obj } : null);
    if (obj) setPropertiesTab('text');
  }

  function handleObjectDeselected() {
    setSelectedObject(null);
  }

  function handlePropertiesUpdate(props) {
    canvasRef.current?.updateSelected(props);
    // Re-read updated object state
    const active = canvasRef.current?.getObjects().find((o) => o === /* ref */ o);
    setSelectedObject((prev) => prev ? { ...prev, ...props } : null);
    handleCanvasChanged(canvasRef.current?.getObjects() ?? []);
  }

  function handleRebuildBarcode(props) {
    canvasRef.current?.rebuildBarcode(props);
  }

  // ── Save / Load / New ─────────────────────────────────────────────────────
  async function handleSave() {
    const canvasJSON = canvasRef.current?.getJSON();
    const name = labelSettings.labelName || 'Untitled';
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentLabelId, name, type: 'canvas', labelSettings, canvasJSON, zplCode }),
      });
      const data = await res.json();
      if (data.label) { setCurrentLabelId(data.label.id); setIsDirty(false); }
    } catch {
      alert('Failed to save label.');
    }
  }

  async function handleSaveZplToLibrary(zplText, name) {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || 'Untitled ZPL', type: 'zpl', labelSettings, zplCode: zplText }),
      });
      const data = await res.json();
      if (data.label) setCurrentLabelId(data.label.id);
    } catch {
      alert('Failed to save label.');
    }
  }

  function handleLoadFromLibrary(label) {
    if (label.labelSettings) setLabelSettings(label.labelSettings);
    if (label.type === 'zpl') {
      if (label.zplCode) handleImportZpl(label.zplCode);
    } else {
      if (label.canvasJSON) canvasRef.current?.loadJSON(label.canvasJSON);
    }
    setCurrentLabelId(label.id);
    setIsDirty(false);
  }

  function handleNew() {
    canvasRef.current?.clearAll();
    setLabelSettings(DEFAULT_SETTINGS);
    setSelectedObject(null);
    setCanvasObjects([]);
    setZplCode('');
    setCurrentLabelId(null);
    setIsDirty(false);
  }

  function handleImportZpl(zplString) {
    const { elements, labelWidthDots, labelHeightDots } = parseZpl(zplString);

    // Update label dimensions if the ZPL contained ^PW / ^LL
    const patch = {};
    if (labelWidthDots) patch.widthInches = Math.round((labelWidthDots / labelSettings.dpi) * 100) / 100;
    if (labelHeightDots) patch.heightInches = Math.round((labelHeightDots / labelSettings.dpi) * 100) / 100;
    if (Object.keys(patch).length) setLabelSettings((prev) => ({ ...prev, ...patch }));

    canvasRef.current?.importFromParsed(elements);
  }

  function handleOrientationChange(newOrientation) {
    const currentIsPortrait = labelSettings.heightInches >= labelSettings.widthInches;
    const wantPortrait = newOrientation === 'portrait';
    if (currentIsPortrait === wantPortrait) return; // already correct orientation

    const oldWidthDots  = Math.round(labelSettings.widthInches  * labelSettings.dpi);
    const oldHeightDots = Math.round(labelSettings.heightInches * labelSettings.dpi);
    const direction = wantPortrait ? 'ccw' : 'cw';

    // Rotate all canvas elements to match the new orientation
    canvasRef.current?.rotateAll90(direction, oldWidthDots, oldHeightDots);

    // Swap label dimensions
    setLabelSettings((prev) => ({
      ...prev,
      widthInches:  prev.heightInches,
      heightInches: prev.widthInches,
    }));
  }

  function handleClear() {
    if (window.confirm('Clear all elements from the canvas?')) {
      canvasRef.current?.clearAll();
      setSelectedObject(null);
      setCanvasObjects([]);
      setZplCode('');
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top header */}
      <Header
        labelSettings={labelSettings}
        onSettingsChange={handleSettingsChange}
        zoom={zoom}
        onZoomChange={setZoom}
        onOrientationChange={handleOrientationChange}
        onSave={handleSave}
        onLibrary={() => setLibraryOpen(true)}
        onClear={handleClear}
        onManagePrinters={() => setPrintersOpen(true)}
        onPrint={() => setPrintOpen(true)}
        onHelp={() => setHelpOpen(true)}
        isSaved={!!currentLabelId && !isDirty}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Element palette */}
        <ElementPalette onAdd={handleAdd} />

        {/* Center: Canvas + Summary */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <LabelCanvas
            ref={canvasRef}
            labelWidthDots={labelWidthDots}
            labelHeightDots={labelHeightDots}
            zoom={zoom}
            onObjectSelected={handleObjectSelected}
            onObjectDeselected={handleObjectDeselected}
            onCanvasChanged={handleCanvasChanged}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled(v => !v)}
          />
          <LabelSummary labelSettings={labelSettings} canvasObjects={canvasObjects} />
        </div>

        {/* Right: Properties + ZPL */}
        <aside className="w-[380px] flex flex-col bg-slate-900 border-l border-slate-700 overflow-hidden shrink-0">
          {/* Properties panel — collapsible, tabbed */}
          <div className="flex flex-col border-b border-slate-700 shrink-0 overflow-hidden"
               style={propertiesOpen ? { height: '42%' } : {}}>
            {/* Tab bar */}
            <div className="flex items-center bg-slate-800 border-b border-slate-700 shrink-0">
              <button
                onClick={() => setPropertiesTab('label')}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors border-r border-slate-700 ${
                  propertiesTab === 'label'
                    ? 'text-white bg-slate-700'
                    : 'text-slate-500 hover:text-slate-300'}`}>
                Label
              </button>
              <button
                onClick={() => setPropertiesTab('text')}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors border-r border-slate-700 ${
                  propertiesTab === 'text'
                    ? 'text-white bg-slate-700'
                    : 'text-slate-500 hover:text-slate-300'}`}>
                Text
              </button>
              <button
                onClick={() => setPropertiesOpen((v) => !v)}
                className={`px-3 py-2 text-xs border-l border-slate-700 transition-colors ${
                  propertiesOpen
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-slate-300'}`}>
                {propertiesOpen ? '▲' : '▼'}
              </button>
            </div>
            {propertiesOpen && (
              <div className="flex-1 overflow-y-auto">
                {propertiesTab === 'text' && !selectedObject
                  ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                      <span className="text-2xl text-slate-700">☰</span>
                      <p className="text-xs text-slate-500">
                        Add an element to the canvas, then select it to edit its properties here.
                      </p>
                    </div>
                  ) : (
                    <PropertiesPanel
                      selectedObject={propertiesTab === 'text' ? selectedObject : null}
                      labelSettings={labelSettings}
                      onUpdate={handlePropertiesUpdate}
                      onRebuildBarcode={handleRebuildBarcode}
                      onSettingsChange={handleSettingsChange}
                    />
                  )
                }
              </div>
            )}
          </div>

          {/* ZPL panel — fills remaining space */}
          <div className="flex flex-col flex-1 min-h-0">
            <ZplPanel
              zplCode={zplCode}
              labelSettings={labelSettings}
              onImportZpl={handleImportZpl}
              onSaveZplToLibrary={handleSaveZplToLibrary}
            />
          </div>
        </aside>
      </div>

      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <LabelLibrary
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onLoad={handleLoadFromLibrary}
        onNew={handleNew}
      />

      <PrinterSettings
        isOpen={printersOpen}
        onClose={() => setPrintersOpen(false)}
      />

      <PrintDialog
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        onManagePrinters={() => { setPrintOpen(false); setPrintersOpen(true); }}
        canvasObjects={canvasObjects}
        labelSettings={labelSettings}
        generateZpl={generateZpl}
      />
    </div>
  );
}

function elementTypeName(type) {
  const names = { text: 'Text', barcode: 'Barcode', qrcode: 'QR Code', box: 'Box', line: 'Line', image: 'Image' };
  return names[type] ?? type;
}
