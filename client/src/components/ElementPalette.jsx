import React, { useRef } from 'react';

const ELEMENTS = [
  { type: 'text',    icon: 'T',   label: 'Text',      title: 'Add text field' },
  { type: 'code128', icon: '|||', label: 'Code 128',  title: 'Add Code 128 barcode' },
  { type: 'code39',  icon: '||/', label: 'Code 39',   title: 'Add Code 39 barcode' },
  { type: 'qrcode',  icon: '▦',   label: 'QR Code',   title: 'Add QR code' },
  { type: 'box',     icon: '□',   label: 'Box',        title: 'Add rectangle/box' },
  { type: 'line',    icon: '─',   label: 'Line',       title: 'Add horizontal line' },
  { type: 'image',   icon: '🖼',   label: 'Image',      title: 'Upload and add image' },
];

export default function ElementPalette({ onAdd }) {
  const fileInputRef = useRef(null);

  function handleClick(type) {
    if (type === 'image') {
      fileInputRef.current?.click();
      return;
    }
    onAdd(type);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      onAdd('image', file);
      e.target.value = '';
    }
  }

  return (
    <aside className="w-[72px] bg-slate-900 border-r border-slate-700 flex flex-col items-center py-3 gap-1.5 shrink-0">
      <p className="text-[10px] text-slate-500 font-semibold mb-1 text-center uppercase tracking-wide">Add</p>

      {ELEMENTS.map(({ type, icon, label, title }) => (
        <button
          key={type}
          title={title}
          onClick={() => handleClick(type)}
          className="w-[56px] flex flex-col items-center gap-1 py-2.5 rounded bg-slate-800 hover:bg-slate-700
                     border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-blue-300
                     transition-colors cursor-pointer select-none"
        >
          <span className="text-sm leading-none">{icon}</span>
          <span className="text-[10px] leading-tight text-center">{label}</span>
        </button>
      ))}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <div className="mt-auto pt-2 border-t border-slate-700 w-full px-1">
        <p className="text-[9px] text-slate-600 text-center leading-snug">
          Del · delete<br/>
          Ctrl+Z · undo<br/>
          Ctrl+C/V · copy
        </p>
      </div>
    </aside>
  );
}
