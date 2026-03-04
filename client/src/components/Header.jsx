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
  onNew,
  onSave,
  onLibrary,
  onClear,
  onManagePrinters,
  onPrint,
  onHelp,
  isSaved,
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <button onClick={onNew} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-sm">
        New
      </button>
      <button
        onClick={onSave}
        title="Save to library"
        className={`px-3 py-1 rounded text-sm transition-colors ${
          isSaved
            ? 'bg-green-700 hover:bg-green-600 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
        }`}
      >
        {isSaved ? 'Saved ✓' : 'Save'}
      </button>
      <button onClick={onLibrary} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-sm">
        Library
      </button>
      <button onClick={onClear} className="bg-slate-700 hover:bg-red-900 text-slate-200 px-3 py-1 rounded text-sm">
        Clear
      </button>
      <button onClick={onManagePrinters} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-sm">
        Printers
      </button>
      <button
        onClick={onPrint}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-semibold"
      >
        Print
      </button>
      <button
        onClick={onHelp}
        title="User manual"
        className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center border border-slate-600 hover:border-slate-400 transition-colors"
      >?</button>
    </header>
  );
}
