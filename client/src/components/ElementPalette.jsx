import React, { useRef } from 'react';

const ELEMENTS = [
  { type: 'text',    icon: 'T',   label: 'Text'     },
  { type: 'code128', icon: '|||', label: 'Code 128' },
  { type: 'code39',  icon: '||/', label: 'Code 39'  },
  { type: 'qrcode',  icon: '▦',   label: 'QR Code'  },
  { type: 'box',     icon: '□',   label: 'Box'      },
  { type: 'line',    icon: '─',   label: 'Line'     },
  { type: 'image',   icon: '🖼',   label: 'Image'    },
];

const FIELDS = [
  'CompanyName',
  'Store',
  'Color',
  'Department',
  'Category',
  'SubCategory',
  'Date',
  'Size',
  'Price',
  'barcode',
];

export default function ElementPalette({ onAdd }) {
  const fileInputRef = useRef(null);

  function handleElementClick(type) {
    if (type === 'image') { fileInputRef.current?.click(); return; }
    onAdd(type);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) { onAdd('image', file); e.target.value = ''; }
  }

  return (
    <aside className="w-[116px] bg-slate-900 border-r border-slate-700 flex flex-col py-3 gap-1 shrink-0 overflow-y-auto">

      {/* ── Elements ── */}
      <p className="text-[10px] text-slate-500 font-semibold mb-0.5 text-center uppercase tracking-wide px-2">Add</p>
      <div className="flex flex-col gap-1 px-2">
        {ELEMENTS.map(({ type, icon, label }) => (
          <button
            key={type}
            title={`Add ${label}`}
            onClick={() => handleElementClick(type)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700
                       border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-blue-300
                       transition-colors cursor-pointer select-none"
          >
            <span className="text-xs leading-none w-5 text-center shrink-0">{icon}</span>
            <span className="text-xs leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* ── Fields ── */}
      <div className="border-t border-slate-700 mt-1 pt-2 px-2 flex flex-col gap-1">
        <p className="text-[10px] text-slate-500 font-semibold mb-0.5 text-center uppercase tracking-wide">Fields</p>
        {FIELDS.map((name) => (
          <button
            key={name}
            title={`Add {{${name}}} field`}
            onClick={() => onAdd('variable', name)}
            className="w-full text-left px-2 py-1 rounded text-xs font-mono
                       bg-slate-800 hover:bg-amber-900/50 border border-slate-700
                       hover:border-amber-600 text-slate-400 hover:text-amber-300
                       transition-colors cursor-pointer select-none truncate"
          >
            {`{{${name}}}`}
          </button>
        ))}

        {/* Barcode field — choose type */}
        <div className="rounded border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-2 py-1 text-xs font-mono text-slate-400 border-b border-slate-700">
            {'{{barcode}}'}
          </div>
          <div className="flex">
            {[['128', 'code128'], ['39', 'code39'], ['QR', 'qrcode']].map(([label, type]) => (
              <button
                key={type}
                title={`Add {{barcode}} as ${label}`}
                onClick={() => onAdd('variable-barcode', type)}
                className="flex-1 py-1 text-[10px] font-semibold text-slate-400
                           hover:bg-amber-900/50 hover:text-amber-300
                           transition-colors border-r border-slate-700 last:border-r-0"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Shortcuts ── */}
      <div className="mt-auto pt-2 border-t border-slate-700 px-2">
        <p className="text-[9px] text-slate-600 text-center leading-snug">
          Del · delete<br/>
          Ctrl+Z · undo<br/>
          Ctrl+C/V · copy
        </p>
      </div>

    </aside>
  );
}
