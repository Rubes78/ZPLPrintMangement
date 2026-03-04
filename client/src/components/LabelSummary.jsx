import React, { useState } from 'react';

const ELEMENT_ICONS = {
  text:    'T',
  barcode: '|||',
  qrcode:  '▦',
  box:     '□',
  line:    '─',
  image:   '🖼',
};

const ELEMENT_LABELS = {
  text:    'Text',
  barcode: 'Barcode',
  qrcode:  'QR Code',
  box:     'Box',
  line:    'Line',
  image:   'Image',
};

function elementValue(obj) {
  if (obj.elementType === 'text')    return obj.text || '—';
  if (obj.elementType === 'barcode') return `${obj.barcodeType?.toUpperCase() || '128'}  ${obj.barcodeData || '—'}`;
  if (obj.elementType === 'qrcode')  return obj.barcodeData || '—';
  return '';
}

export default function LabelSummary({ labelSettings, canvasObjects }) {
  const [open, setOpen] = useState(true);

  const s = labelSettings;
  const wDots = Math.round(s.widthInches * s.dpi);
  const hDots = Math.round(s.heightInches * s.dpi);

  // Collect non-null printer settings
  const printerProps = [
    s.darkness    != null && s.darkness    !== '' && { label: 'Darkness',   value: `${s.darkness}/30` },
    s.printSpeed  != null && s.printSpeed  !== '' && { label: 'Speed',      value: `${s.printSpeed} ips` },
    s.mediaType   != null && s.mediaType   !== '' && { label: 'Media',      value: s.mediaType === 'T' ? 'Thermal Transfer' : 'Direct Thermal' },
    s.mediaSensing!= null && s.mediaSensing!== '' && { label: 'Sensing',    value: { Y:'Gap', M:'Black Mark', N:'Continuous', A:'Auto', W:'Cont. Variable' }[s.mediaSensing] || s.mediaSensing },
    s.printMode   != null && s.printMode   !== '' && { label: 'Mode',       value: { T:'Tear-off', P:'Peel', R:'Rewind', C:'Cutter', A:'Applicator' }[s.printMode] || s.printMode },
    s.labelTop    != null && s.labelTop    !== '' && { label: 'Label Top',  value: `${s.labelTop} dots` },
    s.labelShift  != null && s.labelShift  !== '' && { label: 'Shift',      value: `${s.labelShift} dots` },
    s.tearOff     != null && s.tearOff     !== '' && { label: 'Tear-off',   value: `${s.tearOff} dots` },
  ].filter(Boolean);

  const elements = canvasObjects.filter(o => o.elementType);

  return (
    <div className="shrink-0 border-t border-slate-700 bg-slate-900">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-800 hover:bg-slate-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Label Summary</span>
          <span className="text-[10px] text-slate-500">
            {s.widthInches}" × {s.heightInches}"  ·  {s.dpi} DPI  ·  {elements.length} element{elements.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-[10px] text-slate-500">{open ? '▼' : '▲'}</span>
      </button>

      {open && (
        <div className="flex gap-0 divide-x divide-slate-700 overflow-x-auto" style={{ maxHeight: 160 }}>

          {/* Label settings column */}
          <div className="shrink-0 px-3 py-2 flex flex-col gap-1 min-w-[160px]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Label</p>
            <Row label="Size"    value={`${s.widthInches}" × ${s.heightInches}"`} />
            <Row label="DPI"     value={`${s.dpi}  (${wDots} × ${hDots} dots)`} />
            <Row label="Name"    value={s.labelName || '—'} />
            {printerProps.length === 0 && (
              <p className="text-[10px] text-slate-600 italic mt-1">No printer overrides set</p>
            )}
          </div>

          {/* Printer settings column (only if any set) */}
          {printerProps.length > 0 && (
            <div className="shrink-0 px-3 py-2 flex flex-col gap-1 min-w-[160px]">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Printer</p>
              {printerProps.map(({ label, value }) => (
                <Row key={label} label={label} value={value} />
              ))}
            </div>
          )}

          {/* Elements column */}
          <div className="flex-1 px-3 py-2 overflow-y-auto min-w-[200px]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Elements {elements.length > 0 && `(${elements.length})`}
            </p>
            {elements.length === 0
              ? <p className="text-[10px] text-slate-600 italic">No elements on canvas</p>
              : elements.map((obj, i) => (
                <div key={i} className="flex items-baseline gap-2 py-0.5 border-b border-slate-800 last:border-0">
                  <span className="text-[10px] font-mono text-slate-500 w-5 shrink-0 text-center">
                    {ELEMENT_ICONS[obj.elementType] || '?'}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 w-14">{ELEMENT_LABELS[obj.elementType]}</span>
                  <span className="text-[10px] text-slate-300 font-mono truncate flex-1" title={elementValue(obj)}>
                    {elementValue(obj)}
                  </span>
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {Math.round(obj.left)}, {Math.round(obj.top)}
                  </span>
                </div>
              ))
            }
          </div>

        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-slate-500 shrink-0 w-16">{label}</span>
      <span className="text-[10px] text-slate-300 truncate">{value}</span>
    </div>
  );
}
