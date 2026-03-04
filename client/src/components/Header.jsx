import React, { useState, useRef, useEffect } from 'react';

export default function Header({
  labelSettings,
  onSettingsChange,
  zoom,
  onZoomChange,
  onSave,
  onSaveAs,
  onDeleteLabel,
  onLibrary,
  onClear,
  onManagePrinters,
  onPrint,
  onBatchPrint,
  onHelp,
  isSaved,
  labels = [],
  onLoadLabel,
  onNew,
  currentLabelId,
}) {
  const { labelName, widthInches, heightInches, dpi } = labelSettings;

  return (
    <header className="flex items-center gap-2 bg-slate-900 border-b border-slate-700 px-3 py-2 shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-lg">🏷️</span>
        <span className="font-bold text-blue-400 text-sm tracking-wide whitespace-nowrap">ZPL Editor</span>
      </div>

      <div className="h-5 border-l border-slate-700 shrink-0" />

      {/* Label name */}
      <input
        type="text"
        value={labelName}
        onChange={(e) => onSettingsChange({ labelName: e.target.value })}
        placeholder="Label name"
        className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 w-32 focus:outline-none focus:border-blue-500 shrink-0"
      />

      {/* Size indicator — read-only, click hint to edit in panel */}
      <span
        className="text-xs text-slate-500 whitespace-nowrap shrink-0 cursor-default"
        title="Edit size and DPI in the Label tab of the Properties panel"
      >
        {widthInches}″×{heightInches}″ · {dpi}dpi
      </span>

      <div className="h-5 border-l border-slate-700 shrink-0" />

      {/* Zoom */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onZoomChange(Math.max(0.1, zoom - 0.1))}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-sm" title="Zoom out">−</button>
        <span className="text-xs text-slate-300 w-11 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-sm" title="Zoom in">+</button>
        <button onClick={() => onZoomChange(1)}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-xs" title="Reset zoom">1:1</button>
      </div>

      {/* Library + Clear icons */}
      <div className="flex items-center gap-1 shrink-0">
        <IconBtn onClick={onLibrary} title="Label library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M3 5h18M3 10h18M3 15h18M3 20h18" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onClear} title="Clear canvas" danger>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </IconBtn>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* New */}
      <button onClick={onNew}
        className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-sm shrink-0">
        New
      </button>

      {/* Open label dropdown + delete */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={currentLabelId ?? ''}
            onChange={(e) => {
              const label = labels.find((l) => l.id === e.target.value);
              if (label) onLoadLabel(label);
            }}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[150px]"
            title="Open a saved label"
          >
            <option value="" disabled>Open label…</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {currentLabelId && (
            <IconBtn onClick={onDeleteLabel} title="Delete this label" danger>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </IconBtn>
          )}
        </div>
      )}

      {/* Save split button */}
      <SplitBtn
        label={isSaved ? 'Saved ✓' : 'Save'}
        onClick={onSave}
        primary={false}
        active={isSaved}
        options={[{ label: 'Save As…', onClick: onSaveAs }]}
      />

      {/* Print split button */}
      <SplitBtn
        label="Print"
        onClick={onPrint}
        primary={true}
        options={[{ label: 'Batch Print…', onClick: onBatchPrint }]}
      />

      <div className="h-5 border-l border-slate-700 shrink-0" />

      {/* Utility icons */}
      <div className="flex items-center gap-1 shrink-0">
        <IconBtn onClick={onManagePrinters} title="Printer settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onHelp} title="User manual">
          <span className="text-sm font-bold leading-none">?</span>
        </IconBtn>
      </div>
    </header>
  );
}

// ── Split button: main action + dropdown for secondary ─────────────────────────
function SplitBtn({ label, onClick, primary, active, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const base = primary
    ? 'bg-blue-600 hover:bg-blue-500 text-white'
    : active
      ? 'bg-green-700 hover:bg-green-600 text-white'
      : 'bg-slate-700 hover:bg-slate-600 text-slate-200';

  return (
    <div ref={ref} className="relative flex shrink-0">
      <button onClick={onClick}
        className={`${base} px-3 py-1 rounded-l text-sm font-medium border-r border-black/20 transition-colors`}>
        {label}
      </button>
      <button onClick={() => setOpen((v) => !v)} title="More options"
        className={`${base} px-1.5 py-1 rounded-r text-xs transition-colors`}>
        ▾
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl z-50 min-w-[140px]">
          {options.map(({ label: optLabel, onClick: optClick }) => (
            <button key={optLabel}
              onClick={() => { optClick(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white whitespace-nowrap first:rounded-t last:rounded-b">
              {optLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, title, danger = false, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
        danger
          ? 'text-slate-500 hover:text-red-400 bg-slate-800 border-slate-700 hover:border-red-700 hover:bg-red-900/20'
          : 'text-slate-400 hover:text-slate-100 bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-700'
      }`}>
      {children}
    </button>
  );
}
