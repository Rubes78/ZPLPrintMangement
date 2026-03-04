import React from 'react';

const DPI_OPTIONS = [203, 300];
const COMMON_SIZES = [
  { label: '4" × 6"', w: 4, h: 6 },
  { label: '4" × 4"', w: 4, h: 4 },
  { label: '2" × 1"', w: 2, h: 1 },
  { label: '3" × 2"', w: 3, h: 2 },
  { label: '4" × 3"', w: 4, h: 3 },
];

export default function Header({
  labelSettings,
  onSettingsChange,
  zoom,
  onZoomChange,
  onOrientationChange,
  onSave,
  onLibrary,
  onClear,
  onManagePrinters,
  onPrint,
  onHelp,
  isSaved,
  labels = [],
  onLoadLabel,
  currentLabelId,
}) {
  const { labelName, widthInches, heightInches, dpi } = labelSettings;
  const isPortrait = heightInches >= widthInches;

  function handlePreset(e) {
    const val = e.target.value;
    if (!val) return;
    const [w, h] = val.split('x').map(Number);
    onSettingsChange({ widthInches: w, heightInches: h });
    e.target.value = '';
  }

  return (
    <header className="flex items-center gap-3 bg-slate-900 border-b border-slate-700 px-4 py-2 shrink-0 flex-wrap">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <span className="text-xl">🏷️</span>
        <span className="font-bold text-blue-400 text-sm tracking-wide whitespace-nowrap">ZPL Editor</span>
      </div>

      {/* Label name */}
      <input
        type="text"
        value={labelName}
        onChange={(e) => onSettingsChange({ labelName: e.target.value })}
        placeholder="Label name"
        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 w-36 focus:outline-none focus:border-blue-500"
      />

      <div className="h-5 border-l border-slate-700" />

      {/* Preset sizes */}
      <select
        onChange={handlePreset}
        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
        defaultValue=""
      >
        <option value="" disabled>Preset size</option>
        {COMMON_SIZES.map((s) => (
          <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>
        ))}
      </select>

      {/* Width */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">W</span>
        <input
          type="number"
          min="0.5" max="12" step="0.25"
          value={widthInches}
          onChange={(e) => onSettingsChange({ widthInches: parseFloat(e.target.value) || 4 })}
          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 w-16 focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-slate-400">"</span>
      </div>

      {/* Height */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">H</span>
        <input
          type="number"
          min="0.5" max="24" step="0.25"
          value={heightInches}
          onChange={(e) => onSettingsChange({ heightInches: parseFloat(e.target.value) || 6 })}
          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 w-16 focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-slate-400">"</span>
      </div>

      {/* DPI */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">DPI</span>
        <select
          value={dpi}
          onChange={(e) => onSettingsChange({ dpi: parseInt(e.target.value) })}
          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-blue-500"
        >
          {DPI_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Orientation */}
      <div className="flex items-center gap-1" title="Label orientation — rotates content and swaps dimensions">
        <button
          onClick={() => onOrientationChange('portrait')}
          title="Portrait (height ≥ width)"
          className={`flex flex-col items-center justify-center w-7 h-7 rounded border transition-colors ${
            isPortrait
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
          }`}
        >
          {/* Portrait icon: tall rectangle */}
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <rect x="1" y="1" width="8" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
        <button
          onClick={() => onOrientationChange('landscape')}
          title="Landscape (width > height)"
          className={`flex flex-col items-center justify-center w-7 h-7 rounded border transition-colors ${
            !isPortrait
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
          }`}
        >
          {/* Landscape icon: wide rectangle */}
          <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
            <rect x="1" y="1" width="12" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
      </div>

      <div className="h-5 border-l border-slate-700" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-sm"
          title="Zoom out"
        >−</button>
        <span className="text-xs text-slate-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-sm"
          title="Zoom in"
        >+</button>
        <button
          onClick={() => onZoomChange(1)}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-xs"
          title="Reset zoom"
        >1:1</button>
      </div>

      {/* ── Icon actions (left of spacer) ── */}
      <div className="flex items-center gap-1">
        <IconBtn onClick={onLibrary} title="Label library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3 5h18M3 10h18M3 15h18M3 20h18" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onClear} title="Clear canvas" danger>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </IconBtn>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Quick-load dropdown ── */}
      {labels.length > 0 && (
        <select
          value={currentLabelId ?? ''}
          onChange={(e) => {
            const label = labels.find((l) => l.id === e.target.value);
            if (label) onLoadLabel(label);
          }}
          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[160px]"
          title="Open a saved label"
        >
          <option value="" disabled>Open label…</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}

      {/* ── Primary actions (right of spacer) ── */}
      <button
        onClick={onSave}
        title="Save to library"
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          isSaved
            ? 'bg-green-700 hover:bg-green-600 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        }`}
      >
        {isSaved ? 'Saved ✓' : 'Save'}
      </button>
      <button
        onClick={onPrint}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-semibold"
      >
        Print
      </button>

      <div className="h-5 border-l border-slate-700" />

      {/* ── Utility icons ── */}
      <IconBtn onClick={onManagePrinters} title="Printer settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41" />
        </svg>
      </IconBtn>
      <IconBtn onClick={onHelp} title="User manual">
        <span className="text-sm font-bold leading-none">?</span>
      </IconBtn>
    </header>
  );
}

function IconBtn({ onClick, title, danger = false, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
        danger
          ? 'text-slate-500 hover:text-red-400 bg-slate-800 border-slate-700 hover:border-red-700 hover:bg-red-900/20'
          : 'text-slate-400 hover:text-slate-100 bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
