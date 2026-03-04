import React, { useRef, useState, useEffect } from 'react';

const ELEMENTS = [
  { type: 'text',    icon: 'T',   label: 'Text'     },
  { type: 'code128', icon: '|||', label: 'Code 128' },
  { type: 'code39',  icon: '||/', label: 'Code 39'  },
  { type: 'qrcode',  icon: '▦',   label: 'QR Code'  },
  { type: 'box',     icon: '□',   label: 'Box'      },
  { type: 'line',    icon: '─',   label: 'Line'     },
  { type: 'image',   icon: '🖼',   label: 'Image'    },
];

export default function ElementPalette({ onAdd }) {
  const fileInputRef = useRef(null);
  const addInputRef  = useRef(null);
  const editInputRef = useRef(null);

  const [fields, setFields]         = useState([]);       // [{ name, builtin }]
  const [newField, setNewField]     = useState('');
  const [adding, setAdding]         = useState(false);
  const [editing, setEditing]       = useState(null);     // { name, draft }

  useEffect(() => {
    fetch('/api/fields').then(r => r.json()).then(setFields).catch(() => {});
  }, []);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editing) setTimeout(() => editInputRef.current?.focus(), 0);
  }, [editing?.name]);

  // ── Element buttons ────────────────────────────────────────────────────────

  function handleElementClick(type) {
    if (type === 'image') { fileInputRef.current?.click(); return; }
    onAdd(type);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) { onAdd('image', file); e.target.value = ''; }
  }

  // ── Add field ──────────────────────────────────────────────────────────────

  function openAdd() {
    setAdding(true);
    setNewField('');
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  async function confirmAdd() {
    const name = newField.trim().replace(/\s+/g, '');
    if (!name) { setAdding(false); return; }
    const res = await fetch('/api/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.fields) setFields(data.fields);
    setAdding(false);
    setNewField('');
  }

  function cancelAdd() { setAdding(false); setNewField(''); }

  // ── Edit field ─────────────────────────────────────────────────────────────

  function startEdit(field) {
    setEditing({ name: field.name, draft: field.name });
  }

  async function confirmEdit() {
    const newName = editing.draft.trim().replace(/\s+/g, '');
    if (!newName || newName === editing.name) { setEditing(null); return; }
    const res = await fetch(`/api/fields/${encodeURIComponent(editing.name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    });
    const data = await res.json();
    if (data.fields) setFields(data.fields);
    setEditing(null);
  }

  function cancelEdit() { setEditing(null); }

  // ── Delete field ───────────────────────────────────────────────────────────

  async function deleteField(name) {
    await fetch(`/api/fields/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setFields(prev => prev.filter(f => f.name !== name));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside className="w-[172px] bg-slate-900 border-r border-slate-700 flex flex-col py-3 gap-1 shrink-0 overflow-y-auto">

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
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Fields</p>
          <button onClick={openAdd} title="Add custom field"
            className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors font-bold px-1">
            +
          </button>
        </div>

        {/* All fields from server */}
        {fields.map((field) => {
          const isEditing = editing?.name === field.name;

          if (isEditing) return (
            <div key={field.name} className="flex gap-0.5">
              <input
                ref={editInputRef}
                value={editing.draft}
                onChange={e => setEditing(prev => ({ ...prev, draft: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                onBlur={confirmEdit}
                className="flex-1 min-w-0 bg-slate-800 border border-amber-600 rounded-l px-1.5 py-1
                           text-xs font-mono text-slate-200 focus:outline-none"
                spellCheck={false}
              />
              <button onClick={cancelEdit}
                className="shrink-0 px-1.5 py-1 rounded-r bg-slate-700 border border-slate-600
                           text-[10px] text-slate-400 hover:text-white transition-colors">
                ✕
              </button>
            </div>
          );

          return (
            <div key={field.name} className="flex items-center gap-0.5 group">
              <button
                title={`Add {{${field.name}}} field`}
                onClick={() => onAdd('variable', field.name)}
                className="flex-1 min-w-0 text-left px-2 py-1 rounded-l text-xs font-mono
                           bg-slate-800 hover:bg-amber-900/50 border border-r-0 border-slate-700
                           hover:border-amber-600 text-slate-400 hover:text-amber-300
                           transition-colors cursor-pointer select-none truncate"
              >
                {`{{${field.name}}}`}
              </button>
              {/* Edit button — always shown */}
              <button
                onClick={() => startEdit(field)}
                title={`Rename ${field.name}`}
                className="shrink-0 px-1 py-1 bg-slate-800 border-y border-slate-700
                           text-[10px] text-slate-600 hover:text-blue-400 hover:bg-slate-700
                           transition-colors opacity-0 group-hover:opacity-100"
              >✎</button>
              {/* Delete button — custom fields only */}
              {!field.builtin && (
                <button
                  onClick={() => deleteField(field.name)}
                  title={`Remove ${field.name}`}
                  className="shrink-0 px-1 py-1 rounded-r bg-slate-800 border border-l-0 border-slate-700
                             text-[10px] text-slate-600 hover:text-red-400 hover:border-red-700 hover:bg-red-900/20
                             transition-colors opacity-0 group-hover:opacity-100"
                >×</button>
              )}
            </div>
          );
        })}

        {/* Barcode element — single row, same height as field buttons */}
        <div className="flex items-stretch rounded border border-slate-700 overflow-hidden">
          <span className="px-2 py-1 text-xs font-mono text-slate-500 bg-slate-800 border-r border-slate-700 shrink-0 flex items-center">
            Barcode
          </span>
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

        {/* Add field input */}
        {adding && (
          <div className="flex gap-0.5 mt-0.5">
            <input
              ref={addInputRef}
              type="text"
              value={newField}
              onChange={e => setNewField(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') cancelAdd(); }}
              placeholder="FieldName"
              className="flex-1 min-w-0 bg-slate-800 border border-amber-600 rounded-l px-2 py-1
                         text-xs font-mono text-slate-200 focus:outline-none placeholder-slate-600"
              spellCheck={false}
            />
            <button onClick={confirmAdd}
              className="shrink-0 px-1.5 py-1 rounded-r bg-amber-700 hover:bg-amber-600
                         text-white text-[10px] font-bold transition-colors">
              ✓
            </button>
          </div>
        )}
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
