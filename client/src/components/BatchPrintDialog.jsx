import React, { useState, useEffect, useRef } from 'react';
import { extractTemplateVars } from '../lib/zplGenerator.js';
import * as qzTray from '../lib/qzTray.js';

// ── CSV utilities ──────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(splitCsvLine);
  return { headers, rows };
}
function splitCsvLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}
function toCsvRow(values) {
  return values.map((v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}
function downloadCsv(filename, rows) {
  const csv = rows.map(toCsvRow).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function downloadTemplate(templateVars, labelName) {
  const headers = [...templateVars, 'qty'];
  const example = [...templateVars.map((v) => `Example ${v}`), '1'];
  downloadCsv(`${(labelName || 'label').replace(/[^a-z0-9]/gi, '_')}_template.csv`, [headers, example]);
}

// ── Send ZPL ───────────────────────────────────────────────────────────────────
async function sendZpl(zpl, printer) {
  if (!printer) throw new Error('No printer selected');
  if (printer.type === 'qz') {
    await qzTray.printRaw(printer.printerName, zpl);
  } else {
    const resp = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zpl, printerIp: printer.ip, printerPort: printer.port, copies: 1 }),
    });
    if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
  }
}

// ── UID ────────────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function ImportPanel({
  isOpen, onClose,
  canvasObjects, labelSettings, currentLabelId, generateZpl,
}) {
  const [tab, setTab] = useState('import');
  const [queue, setQueue] = useState([]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'import', label: 'Import' },
    { id: 'queue', label: 'Queue', badge: queue.length || null },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">

      {/* Top bar */}
      <div className="flex items-center gap-4 px-5 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" />
          </svg>
          <span className="font-semibold text-slate-100 text-sm">Import &amp; Print</span>
        </div>

        <nav className="flex bg-slate-800 rounded p-0.5 gap-0.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t.label}
              {t.badge ? (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-600 text-slate-300'}`}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex-1" />
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-800 transition-colors">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {tab === 'import' && (
          <ImportView
            canvasObjects={canvasObjects}
            labelSettings={labelSettings}
            currentLabelId={currentLabelId}
            generateZpl={generateZpl}
            queue={queue}
            setQueue={setQueue}
            onGoQueue={() => setTab('queue')}
          />
        )}
        {tab === 'queue' && (
          <QueueView queue={queue} setQueue={setQueue} />
        )}
        {tab === 'history' && <HistoryView />}
      </div>
    </div>
  );
}

// ── Import View ────────────────────────────────────────────────────────────────
function ImportView({ canvasObjects, labelSettings, currentLabelId, generateZpl, queue, setQueue, onGoQueue }) {
  const [csvData, setCsvData]       = useState(null);
  const [edits, setEdits]           = useState({});        // { rowIdx: { colIdx: value } }
  const [mapping, setMapping]       = useState({});
  const [qtyColumn, setQtyColumn]   = useState('');
  const [defaultQty, setDefaultQty] = useState(1);
  const [selected, setSelected]     = useState(new Set());
  const [printers, setPrinters]     = useState([]);
  const [printer, setPrinter]       = useState(null);
  const [printing, setPrinting]     = useState(false);
  const [progress, setProgress]     = useState(null);
  const [rowStatuses, setRowStatuses] = useState({});
  const [profiles, setProfiles]     = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [editingCell, setEditingCell] = useState(null);   // { rowIdx, colIdx }
  const [labels, setLabels]           = useState([]);
  const [localCanvasObjects, setLocalCanvasObjects] = useState(null);
  const [localLabelSettings, setLocalLabelSettings] = useState(null);
  const [localLabelId, setLocalLabelId] = useState(null);
  const fileRef     = useRef(null);
  const cellInputRef = useRef(null);

  // Use locally selected label if set, otherwise fall back to currently open label
  const effectiveCanvasObjects = localCanvasObjects ?? canvasObjects;
  const effectiveLabelSettings = localLabelSettings ?? labelSettings;
  const effectiveLabelId       = localLabelId ?? currentLabelId;

  const templateVars = extractTemplateVars(effectiveCanvasObjects);

  useEffect(() => {
    fetch('/api/printers').then((r) => r.json()).then((data) => {
      setPrinters(data);
      setPrinter((prev) => (prev && data.find((p) => p.name === prev.name)) ? prev : (data[0] ?? null));
    }).catch(() => {});
    fetch('/api/labels').then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : (data.labels ?? []);
      setLabels(arr.filter((l) => l.type === 'canvas' && l.canvasJSON));
    }).catch(() => {});
    fetchProfiles();
  }, []);

  function handleLabelSelect(labelId) {
    if (!labelId) {
      setLocalCanvasObjects(null);
      setLocalLabelSettings(null);
      setLocalLabelId(null);
      setMapping({});
      return;
    }
    const label = labels.find((l) => l.id === labelId);
    if (!label) return;
    const objects = label.canvasJSON?.objects ?? [];
    setLocalCanvasObjects(objects);
    setLocalLabelSettings(label.labelSettings);
    setLocalLabelId(label.id);
    setMapping({});  // reset mapping so auto-map runs on next CSV load
  }

  useEffect(() => {
    if (editingCell && cellInputRef.current) cellInputRef.current.focus();
  }, [editingCell]);

  function fetchProfiles() {
    fetch('/api/import-profiles').then((r) => r.json()).then(setProfiles).catch(() => {});
  }

  function applyProfile(profile) {
    setActiveProfileId(profile.id);
    setMapping(profile.mapping || {});
    setQtyColumn(profile.qtyColumn || '');
    setDefaultQty(profile.defaultQty || 1);
  }

  async function saveProfile() {
    const existing = profiles.find((p) => p.id === activeProfileId);
    const name = window.prompt('Profile name:', existing?.name || '');
    if (!name) return;
    const body = { name, labelId: currentLabelId, labelName: labelSettings.labelName, mapping, qtyColumn, defaultQty };
    if (existing) body.id = activeProfileId;
    const resp = await fetch('/api/import-profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await resp.json();
    fetchProfiles();
    setActiveProfileId(data.id);
  }

  async function deleteProfile() {
    if (!activeProfileId || !window.confirm('Delete this profile?')) return;
    await fetch(`/api/import-profiles/${activeProfileId}`, { method: 'DELETE' });
    setActiveProfileId(null);
    fetchProfiles();
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCsv(e.target.result);
      setCsvData(parsed);
      setEdits({});
      setSelected(new Set(parsed.rows.map((_, i) => i)));
      setRowStatuses({});
      setProgress(null);
      // Auto-map by name match (profile takes precedence)
      const autoMap = {};
      templateVars.forEach((v) => {
        const match = parsed.headers.find((h) => h.toLowerCase() === v.toLowerCase());
        if (match) autoMap[v] = match;
      });
      setMapping((prev) => ({ ...autoMap, ...prev }));
      // Auto-detect qty column
      const qtyCol = parsed.headers.find((h) => /^(qty|quantity|copies|count)$/i.test(h));
      if (qtyCol && !qtyColumn) setQtyColumn(qtyCol);
    };
    reader.readAsText(file);
  }

  function getCellValue(rowIdx, colIdx) {
    return edits[rowIdx]?.[colIdx] ?? csvData?.rows[rowIdx]?.[colIdx] ?? '';
  }
  function setCellValue(rowIdx, colIdx, value) {
    setEdits((prev) => ({ ...prev, [rowIdx]: { ...prev[rowIdx], [colIdx]: value } }));
  }
  function getVarsForRow(rowIdx) {
    const vars = {};
    templateVars.forEach((v) => {
      const col = mapping[v];
      if (col) {
        const idx = csvData.headers.indexOf(col);
        vars[v] = idx >= 0 ? getCellValue(rowIdx, idx) : '';
      }
    });
    return vars;
  }
  function getQtyForRow(rowIdx) {
    if (qtyColumn) {
      const idx = csvData.headers.indexOf(qtyColumn);
      if (idx >= 0) {
        const val = parseInt(getCellValue(rowIdx, idx), 10);
        if (!isNaN(val) && val >= 1) return val;
      }
    }
    return defaultQty;
  }

  async function handlePrint() {
    if (!csvData || !printer) return;
    const selectedRows = [...selected].sort((a, b) => a - b);
    if (!selectedRows.length) return;
    setPrinting(true);
    const newStatuses = {};
    selectedRows.forEach((i) => { newStatuses[i] = 'pending'; });
    setRowStatuses(newStatuses);
    setProgress({ done: 0, total: selectedRows.length, errors: 0 });

    const jobRecords = [];
    let done = 0, errors = 0;
    for (const rowIdx of selectedRows) {
      const vars = getVarsForRow(rowIdx);
      const qty = getQtyForRow(rowIdx);
      let status = 'printed';
      let finalZpl = '';
      try {
        const zpl = generateZpl(effectiveCanvasObjects, effectiveLabelSettings, vars);
        finalZpl = qty > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${qty},0,1,Y$1`) : zpl;
        await sendZpl(finalZpl, printer);
      } catch { status = 'failed'; errors++; }
      done++;
      newStatuses[rowIdx] = status;
      setRowStatuses({ ...newStatuses });
      setProgress({ done, total: selectedRows.length, errors });
      jobRecords.push({ vars, qty, status, zpl: finalZpl });
    }

    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelId: effectiveLabelId,
          labelName: effectiveLabelSettings.labelName,
          labelSettings: effectiveLabelSettings,
          zplTemplate: generateZpl(effectiveCanvasObjects, effectiveLabelSettings, {}),
          printer: { name: printer.name, type: printer.type, ip: printer.ip, port: printer.port, printerName: printer.printerName },
          records: jobRecords,
          totalPrinted: jobRecords.filter((r) => r.status === 'printed').length,
          totalFailed: errors,
        }),
      });
    } catch { /* non-critical */ }
    setPrinting(false);
  }

  function handleAddToQueue() {
    if (!csvData) return;
    const selectedRows = [...selected].sort((a, b) => a - b);
    if (!selectedRows.length) return;
    const newItems = selectedRows.map((rowIdx) => {
      const vars = getVarsForRow(rowIdx);
      const qty = getQtyForRow(rowIdx);
      const zpl = generateZpl(effectiveCanvasObjects, effectiveLabelSettings, vars);
      const finalZpl = qty > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${qty},0,1,Y$1`) : zpl;
      return {
        id: uid(),
        labelId: effectiveLabelId,
        labelName: effectiveLabelSettings.labelName,
        labelSettings: effectiveLabelSettings,
        vars,
        qty,
        zpl: finalZpl,
        addedAt: new Date().toISOString(),
      };
    });
    setQueue((prev) => [...prev, ...newItems]);
    onGoQueue();
  }

  const allSelected = csvData && selected.size === csvData.rows.length;
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(csvData.rows.map((_, i) => i)));
  const toggleRow   = (i) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left sidebar ── */}
      <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-y-auto bg-slate-900/40">

        <SideSection label="Label">
          <select
            value={localLabelId ?? ''}
            onChange={(e) => handleLabelSelect(e.target.value || null)}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-2"
          >
            <option value="">— Current: {labelSettings.labelName || 'Untitled'} —</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">{effectiveLabelSettings.widthInches}"×{effectiveLabelSettings.heightInches}" · {effectiveLabelSettings.dpi} dpi</p>
          {templateVars.length === 0 && (
            <p className="text-xs text-amber-400 mt-1">No template variables found on this label.</p>
          )}
        </SideSection>

        <SideSection label="CSV Template">
          <button
            onClick={() => downloadTemplate(templateVars, effectiveLabelSettings.labelName)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-2 rounded border border-slate-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Template
          </button>
          {templateVars.length > 0 && (
            <p className="text-[10px] text-slate-500 mt-1">Columns: {[...templateVars, 'qty'].join(', ')}</p>
          )}
        </SideSection>

        <SideSection label="Import Profile">
          <select
            value={activeProfileId ?? ''}
            onChange={(e) => {
              const p = profiles.find((p) => p.id === e.target.value);
              p ? applyProfile(p) : setActiveProfileId(null);
            }}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-2"
          >
            <option value="">No profile</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={saveProfile}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-2 py-1.5 rounded border border-slate-600 transition-colors">
              {activeProfileId ? 'Update Profile' : 'Save Profile'}
            </button>
            {activeProfileId && (
              <button onClick={deleteProfile}
                className="bg-slate-700 hover:bg-red-900/40 text-slate-500 hover:text-red-400 text-xs px-2 py-1.5 rounded border border-slate-600 hover:border-red-700 transition-colors">
                ✕
              </button>
            )}
          </div>
        </SideSection>

        <SideSection label="1. Upload CSV">
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-2 rounded border border-slate-600 border-dashed transition-colors">
            {csvData ? `✓ ${csvData.rows.length} rows · ${csvData.headers.length} columns` : 'Choose CSV file…'}
          </button>
          {csvData && <p className="text-[10px] text-slate-500 mt-1 break-words">Cols: {csvData.headers.join(', ')}</p>}
        </SideSection>

        {csvData && templateVars.length > 0 && (
          <SideSection label="2. Map Fields">
            <div className="space-y-2">
              {templateVars.map((v) => (
                <div key={v}>
                  <label className="text-[10px] text-amber-300 font-mono block mb-0.5">{`{{${v}}}`}</label>
                  <select value={mapping[v] ?? ''} onChange={(e) => setMapping((p) => ({ ...p, [v]: e.target.value || undefined }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                    <option value="">(none)</option>
                    {csvData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </SideSection>
        )}

        {csvData && (
          <SideSection label="3. Quantity">
            <label className="text-[10px] text-slate-500 block mb-1">Qty column (optional)</label>
            <select value={qtyColumn} onChange={(e) => setQtyColumn(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-3">
              <option value="">(use default)</option>
              {csvData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <label className="text-[10px] text-slate-500 block mb-1">Default qty</label>
            <input type="number" min={1} max={9999} value={defaultQty}
              onChange={(e) => setDefaultQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
          </SideSection>
        )}

        {csvData && (
          <SideSection label="4. Printer">
            {printers.length === 0
              ? <p className="text-xs text-slate-500">No printers configured.</p>
              : (
                <div className="space-y-1.5">
                  {printers.map((p) => (
                    <label key={p.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${printer?.name === p.name ? 'bg-blue-700/50 border-blue-500' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>
                      <input type="radio" name="importPrinter" className="accent-blue-400"
                        checked={printer?.name === p.name} onChange={() => setPrinter(p)} />
                      <div>
                        <div className="text-xs text-slate-100 font-medium">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {p.type === 'qz' ? `QZ: ${p.printerName}` : `${p.ip}:${p.port}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
          </SideSection>
        )}

        <div className="flex-1" />

        {csvData && (
          <div className="px-4 py-4 border-t border-slate-700 space-y-2 shrink-0">
            {progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{progress.done} / {progress.total}</span>
                  {progress.errors > 0 && <span className="text-red-400">{progress.errors} failed</span>}
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <button onClick={handlePrint} disabled={!printer || printing || selected.size === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold py-2 rounded transition-colors">
              {printing ? `Printing… ${progress?.done ?? 0}/${progress?.total ?? 0}` : `Print ${selected.size} Selected`}
            </button>
            <button onClick={handleAddToQueue} disabled={printing || selected.size === 0}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 text-sm font-medium py-2 rounded border border-slate-600 transition-colors">
              Add {selected.size} to Queue
            </button>
          </div>
        )}
      </div>

      {/* ── Right: data table ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!csvData ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-20 h-20 text-slate-800 mx-auto">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" />
              </svg>
              <div>
                <p className="text-slate-400 text-sm font-medium">Upload a CSV to get started</p>
                <p className="text-slate-600 text-xs mt-1">Download the template from the sidebar for the correct format</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Table toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-900/60 shrink-0 text-xs text-slate-400">
              <span>{selected.size} of {csvData.rows.length} selected</span>
              <button onClick={toggleAll} className="text-blue-400 hover:text-blue-300 transition-colors">
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-slate-700">·</span>
              <span className="text-slate-600 italic">Click any cell to edit · Blue = edited</span>
            </div>

            {/* Scrollable table */}
            <div className="flex-1 overflow-auto">
              <table className="text-xs text-slate-300 min-w-full border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr>
                    <th className="w-8 px-3 py-2 text-left border-b border-r border-slate-700">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-400" />
                    </th>
                    <th className="w-12 px-2 py-2 text-center border-b border-r border-slate-700 text-slate-500 font-semibold">Preview</th>
                    {csvData.headers.map((h, i) => {
                      const mappedVar = Object.entries(mapping).find(([, v]) => v === h)?.[0];
                      return (
                        <th key={i} className="px-3 py-2 text-left border-b border-r border-slate-700 font-semibold text-slate-400 whitespace-nowrap">
                          {h}
                          {mappedVar && <span className="ml-1 text-[9px] text-amber-400 font-mono">→{mappedVar}</span>}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-left border-b border-r border-slate-700 font-semibold text-slate-400">Qty</th>
                    <th className="px-3 py-2 text-left border-b border-slate-700 font-semibold text-slate-400 w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.map((row, rowIdx) => {
                    const status = rowStatuses[rowIdx];
                    return (
                      <tr key={rowIdx}
                        className={`border-b border-slate-800/60 ${selected.has(rowIdx) ? 'bg-blue-950/20' : 'hover:bg-slate-800/30'}`}>
                        <td className="px-3 py-1.5 border-r border-slate-800">
                          <input type="checkbox" checked={selected.has(rowIdx)} onChange={() => toggleRow(rowIdx)} className="accent-blue-400" />
                        </td>
                        <td className="px-2 py-1 border-r border-slate-800 text-center">
                          <RowThumb
                            vars={getVarsForRow(rowIdx)}
                            labelSettings={effectiveLabelSettings}
                            generateZpl={generateZpl}
                            canvasObjects={effectiveCanvasObjects}
                          />
                        </td>
                        {row.map((_, colIdx) => {
                          const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx;
                          const val = getCellValue(rowIdx, colIdx);
                          const isEdited = edits[rowIdx]?.[colIdx] !== undefined;
                          return (
                            <td key={colIdx} className="px-1 py-0.5 border-r border-slate-800 max-w-[200px]"
                              onClick={() => !isEditing && setEditingCell({ rowIdx, colIdx })}>
                              {isEditing ? (
                                <input
                                  ref={cellInputRef}
                                  value={val}
                                  onChange={(e) => setCellValue(rowIdx, colIdx, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); setEditingCell(null); }
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  className="w-full bg-blue-900/40 border border-blue-500 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none min-w-[80px]"
                                />
                              ) : (
                                <span className={`block px-2 py-1 rounded cursor-text hover:bg-slate-700/40 truncate transition-colors ${isEdited ? 'text-blue-300' : ''}`}>
                                  {val || <span className="text-slate-700">—</span>}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 border-r border-slate-800 text-slate-400">{getQtyForRow(rowIdx)}</td>
                        <td className="px-3 py-1.5">
                          {status === 'printed' && <span className="text-green-400">✓ Printed</span>}
                          {status === 'failed'  && <span className="text-red-400">✗ Failed</span>}
                          {status === 'pending' && <span className="text-slate-500 animate-pulse">…</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Row thumbnail ──────────────────────────────────────────────────────────────
function RowThumb({ vars, labelSettings, generateZpl, canvasObjects }) {
  const [img, setImg]         = useState(null);
  const [loading, setLoading] = useState(false);

  function load() {
    if (img || loading) return;
    setLoading(true);
    const zpl = generateZpl(canvasObjects, labelSettings, vars);
    fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zpl, widthInches: labelSettings.widthInches, heightInches: labelSettings.heightInches, dpi: labelSettings.dpi }),
    })
      .then((r) => r.blob())
      .then((blob) => { setImg(URL.createObjectURL(blob)); setLoading(false); })
      .catch(() => setLoading(false));
  }

  return (
    <div onClick={load}
      className="w-9 h-9 mx-auto flex items-center justify-center rounded bg-slate-800 border border-slate-700 cursor-pointer hover:border-blue-500 overflow-hidden transition-colors"
      title="Click to preview">
      {img
        ? <img src={img} alt="" className="w-full h-full object-contain" />
        : loading
          ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-600">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
      }
    </div>
  );
}

// ── Queue View ─────────────────────────────────────────────────────────────────
function QueueView({ queue, setQueue }) {
  const [printers, setPrinters]     = useState([]);
  const [printer, setPrinter]       = useState(null);
  const [printing, setPrinting]     = useState(false);
  const [progress, setProgress]     = useState(null);
  const [itemStatuses, setItemStatuses] = useState({});

  useEffect(() => {
    fetch('/api/printers').then((r) => r.json()).then((data) => {
      setPrinters(data);
      setPrinter((prev) => (prev && data.find((p) => p.name === prev.name)) ? prev : (data[0] ?? null));
    }).catch(() => {});
  }, []);

  async function printItems(items) {
    if (!printer || !items.length) return;
    setPrinting(true);
    const statuses = {};
    items.forEach((item) => { statuses[item.id] = 'pending'; });
    setItemStatuses((prev) => ({ ...prev, ...statuses }));
    setProgress({ done: 0, total: items.length, errors: 0 });

    let done = 0, errors = 0;
    const jobRecords = [];

    for (const item of items) {
      let status = 'printed';
      try {
        await sendZpl(item.zpl, printer);
      } catch { status = 'failed'; errors++; }
      done++;
      statuses[item.id] = status;
      setItemStatuses((prev) => ({ ...prev, ...statuses }));
      setProgress({ done, total: items.length, errors });
      jobRecords.push({ vars: item.vars, qty: item.qty, status, zpl: item.zpl });
    }

    // Save to history — group by label
    const byLabel = {};
    items.forEach((item, i) => {
      const key = item.labelId || item.labelName || 'unknown';
      if (!byLabel[key]) byLabel[key] = { item, records: [] };
      byLabel[key].records.push(jobRecords[i]);
    });
    for (const { item, records } of Object.values(byLabel)) {
      try {
        await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            labelId: item.labelId, labelName: item.labelName, labelSettings: item.labelSettings,
            zplTemplate: item.zpl,
            printer: { name: printer.name, type: printer.type, ip: printer.ip, port: printer.port, printerName: printer.printerName },
            records,
            totalPrinted: records.filter((r) => r.status === 'printed').length,
            totalFailed: records.filter((r) => r.status === 'failed').length,
          }),
        });
      } catch { /* non-critical */ }
    }

    setPrinting(false);
    // Remove successfully printed items
    const printedIds = new Set(items.filter((item) => statuses[item.id] === 'printed').map((item) => item.id));
    setQueue((prev) => prev.filter((item) => !printedIds.has(item.id)));
  }

  function removeItem(id) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    setItemStatuses((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-20 h-20 text-slate-800 mx-auto">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <p className="text-slate-400 text-sm font-medium">Queue is empty</p>
          <p className="text-slate-600 text-xs">Use "Add to Queue" in the Import tab to stage items for printing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">

      {/* Left sidebar */}
      <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-y-auto bg-slate-900/40">
        <SideSection label="Printer">
          {printers.length === 0
            ? <p className="text-xs text-slate-500">No printers configured.</p>
            : (
              <div className="space-y-1.5">
                {printers.map((p) => (
                  <label key={p.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${printer?.name === p.name ? 'bg-blue-700/50 border-blue-500' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>
                    <input type="radio" name="queuePrinter" className="accent-blue-400"
                      checked={printer?.name === p.name} onChange={() => setPrinter(p)} />
                    <div>
                      <div className="text-xs text-slate-100 font-medium">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {p.type === 'qz' ? `QZ: ${p.printerName}` : `${p.ip}:${p.port}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
        </SideSection>

        <div className="flex-1" />

        <div className="px-4 py-4 border-t border-slate-700 space-y-2 shrink-0">
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{progress.done} / {progress.total}</span>
                {progress.errors > 0 && <span className="text-red-400">{progress.errors} failed</span>}
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          <button onClick={() => printItems(queue)} disabled={!printer || printing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold py-2 rounded transition-colors">
            {printing ? `Printing… ${progress?.done ?? 0}/${progress?.total ?? 0}` : `Print All (${queue.length})`}
          </button>
          <button onClick={() => setQueue([])} disabled={printing}
            className="w-full bg-slate-700 hover:bg-red-900/30 text-slate-400 hover:text-red-400 text-xs py-1.5 rounded border border-slate-600 hover:border-red-700 transition-colors">
            Clear Queue
          </button>
        </div>
      </div>

      {/* Queue table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs text-slate-300 min-w-full border-collapse">
          <thead className="sticky top-0 bg-slate-900 z-10">
            <tr>
              <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-400 font-semibold">Label</th>
              <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-400 font-semibold">Variables</th>
              <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-400 font-semibold w-16">Qty</th>
              <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-400 font-semibold w-24">Status</th>
              <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-400 font-semibold">Added</th>
              <th className="w-10 border-b border-slate-700" />
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => {
              const status = itemStatuses[item.id];
              return (
                <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2 border-r border-slate-800 font-medium text-slate-200">{item.labelName || 'Untitled'}</td>
                  <td className="px-4 py-2 border-r border-slate-800 text-slate-400 font-mono">
                    {Object.entries(item.vars).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    {Object.keys(item.vars).length > 4 && ' …'}
                    {Object.keys(item.vars).length === 0 && <span className="text-slate-600 italic">no variables</span>}
                  </td>
                  <td className="px-4 py-2 border-r border-slate-800">{item.qty}</td>
                  <td className="px-4 py-2 border-r border-slate-800">
                    {status === 'printed' && <span className="text-green-400">✓ Printed</span>}
                    {status === 'failed'  && <span className="text-red-400">✗ Failed</span>}
                    {status === 'pending' && <span className="text-slate-500 animate-pulse">…</span>}
                    {!status && <span className="text-slate-500">Queued</span>}
                  </td>
                  <td className="px-4 py-2 border-r border-slate-800 text-slate-500">{new Date(item.addedAt).toLocaleTimeString()}</td>
                  <td className="px-2 text-center">
                    <button onClick={() => removeItem(item.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors" title="Remove">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── History View ───────────────────────────────────────────────────────────────
function HistoryView() {
  const [jobs, setJobs]             = useState([]);
  const [expanded, setExpanded]     = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [filterLabel, setFilterLabel] = useState('');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [reprinters, setReprinters]   = useState([]);
  const [reprintPrinter, setReprintPrinter] = useState(null);
  const [loading, setLoading]         = useState(true);
  // { [jobId]: Set<recordIndex> } — which records are checked per job
  const [selectedRecs, setSelectedRecs] = useState({});
  // { [jobId]: { sending, done, total, errors, msg } } — inline reprint status
  const [reprintStatus, setReprintStatus] = useState({});

  useEffect(() => {
    fetchJobs();
    fetch('/api/printers').then((r) => r.json()).then((data) => {
      setReprinters(data);
      setReprintPrinter(data[0] ?? null);
    }).catch(() => {});
  }, []);

  function fetchJobs() {
    setLoading(true);
    fetch('/api/jobs').then((r) => r.json()).then((data) => { setJobs(data); setLoading(false); }).catch(() => setLoading(false));
  }

  async function expand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!expandedData[id]) {
      const data = await fetch(`/api/jobs/${id}`).then((r) => r.json()).catch(() => null);
      if (data) setExpandedData((prev) => ({ ...prev, [id]: data }));
    }
  }

  // Fetch full job detail (expanding if needed), return it
  async function getDetail(job) {
    if (expandedData[job.id]) return expandedData[job.id];
    const data = await fetch(`/api/jobs/${job.id}`).then((r) => r.json()).catch(() => null);
    if (data) setExpandedData((prev) => ({ ...prev, [job.id]: data }));
    return data;
  }

  // Build ZPL for a record — use stored zpl if available, else apply vars to template
  function buildZpl(detail, rec) {
    if (rec.zpl) return rec.zpl;
    if (detail.zplTemplate) {
      let zpl = detail.zplTemplate;
      Object.entries(rec.vars || {}).forEach(([k, v]) => {
        zpl = zpl.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
      });
      const qty = rec.qty || 1;
      return qty > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${qty},0,1,Y$1`) : zpl;
    }
    return null;
  }

  async function reprintRecords(job, indices) {
    if (!reprintPrinter) {
      setReprintStatus((p) => ({ ...p, [job.id]: { msg: 'Select a printer first.', error: true } }));
      return;
    }
    const detail = await getDetail(job);
    if (!detail?.records?.length) {
      setReprintStatus((p) => ({ ...p, [job.id]: { msg: 'No records found.', error: true } }));
      return;
    }
    const recs = indices ? indices.map((i) => detail.records[i]) : detail.records;
    setReprintStatus((p) => ({ ...p, [job.id]: { sending: true, done: 0, total: recs.length, errors: 0 } }));

    let done = 0, errors = 0;
    for (const rec of recs) {
      const zpl = buildZpl(detail, rec);
      if (!zpl) { errors++; } else {
        try { await sendZpl(zpl, reprintPrinter); }
        catch { errors++; }
      }
      done++;
      setReprintStatus((p) => ({ ...p, [job.id]: { sending: true, done, total: recs.length, errors } }));
    }
    setReprintStatus((p) => ({
      ...p,
      [job.id]: { sending: false, done, total: recs.length, errors, msg: errors === 0 ? `Sent ${done} to ${reprintPrinter.name}` : `${done - errors} sent, ${errors} failed` },
    }));
  }

  async function deleteJob(id) {
    if (!window.confirm('Delete this print job from history?')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function toggleRec(jobId, idx) {
    setSelectedRecs((prev) => {
      const cur = new Set(prev[jobId] || []);
      cur.has(idx) ? cur.delete(idx) : cur.add(idx);
      return { ...prev, [jobId]: cur };
    });
  }
  function toggleAllRecs(jobId, total) {
    setSelectedRecs((prev) => {
      const cur = prev[jobId] || new Set();
      const allSel = cur.size === total;
      return { ...prev, [jobId]: allSel ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)) };
    });
  }

  const labelNames = [...new Set(jobs.map((j) => j.labelName).filter(Boolean))].sort();

  const filtered = jobs.filter((j) => {
    if (filterLabel && j.labelName !== filterLabel) return false;
    if (filterFrom && j.createdAt < filterFrom) return false;
    if (filterTo   && j.createdAt > filterTo + 'T23:59:59') return false;
    if (filterStatus === 'success' && j.totalFailed > 0) return false;
    if (filterStatus === 'partial' && (j.totalFailed === 0 || j.totalPrinted === 0)) return false;
    if (filterStatus === 'failed'  && j.totalPrinted > 0) return false;
    return true;
  });

  function exportHistory() {
    const rows = [['Date', 'Label', 'Printer', 'Total', 'Printed', 'Failed']];
    filtered.forEach((j) => rows.push([
      new Date(j.createdAt).toLocaleString(),
      j.labelName || '',
      j.printer?.name || '',
      (j.totalPrinted || 0) + (j.totalFailed || 0),
      j.totalPrinted || 0,
      j.totalFailed || 0,
    ]));
    downloadCsv('print_history.csv', rows);
  }

  return (
    <div className="flex h-full min-h-0">

      {/* Left sidebar */}
      <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-y-auto bg-slate-900/40">

        <SideSection label="Filters">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Label</label>
              <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="">All labels</option>
                {labelNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">From</label>
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">To</label>
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="all">All</option>
                <option value="success">All succeeded</option>
                <option value="partial">Partial failure</option>
                <option value="failed">All failed</option>
              </select>
            </div>
          </div>
        </SideSection>

        <SideSection label="Reprint Printer">
          {reprinters.length === 0
            ? <p className="text-xs text-slate-500">No printers configured.</p>
            : (
              <div className="space-y-1.5">
                {reprinters.map((p) => (
                  <label key={p.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${reprintPrinter?.name === p.name ? 'bg-blue-700/50 border-blue-500' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>
                    <input type="radio" name="reprintPrinter" className="accent-blue-400"
                      checked={reprintPrinter?.name === p.name} onChange={() => setReprintPrinter(p)} />
                    <div>
                      <div className="text-xs text-slate-100 font-medium">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {p.type === 'qz' ? `QZ: ${p.printerName}` : `${p.ip}:${p.port}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
        </SideSection>

        <div className="flex-1" />

        <div className="px-4 py-4 border-t border-slate-700 space-y-2 shrink-0">
          <p className="text-[10px] text-slate-500">{filtered.length} job{filtered.length !== 1 ? 's' : ''} shown</p>
          <button onClick={exportHistory} disabled={!filtered.length}
            className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 text-xs py-2 rounded border border-slate-600 transition-colors flex items-center justify-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export to CSV
          </button>
          <button onClick={fetchJobs} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors">↺ Refresh</button>
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">No jobs match the current filters.</div>
        )}
        <div className="divide-y divide-slate-800">
          {filtered.map((job) => {
            const isExpanded  = expanded === job.id;
            const detail      = expandedData[job.id];
            const jobSelRecs  = selectedRecs[job.id] || new Set();
            const rs          = reprintStatus[job.id];
            const isSending   = rs?.sending;
            const hasSelected = jobSelRecs.size > 0;

            return (
              <div key={job.id}>
                {/* Job row */}
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  onClick={() => expand(job.id)}>
                  <span className="text-slate-600 text-xs w-4 shrink-0">{isExpanded ? '▾' : '▸'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{job.labelName || 'Untitled'}</span>
                      <StatusBadge printed={job.totalPrinted} failed={job.totalFailed} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(job.createdAt).toLocaleString()} · {job.printer?.name || 'Unknown printer'} · {job.recordCount || (job.totalPrinted + job.totalFailed)} records
                    </div>
                    {/* Inline reprint status */}
                    {rs && (
                      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                        {isSending ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1 flex-1 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(rs.done / rs.total) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{rs.done}/{rs.total}</span>
                          </div>
                        ) : (
                          <span className={`text-[10px] ${rs.error ? 'text-red-400' : rs.errors > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                            {rs.msg}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {hasSelected && (
                      <button
                        onClick={() => reprintRecords(job, [...jobSelRecs].sort((a, b) => a - b))}
                        disabled={isSending}
                        className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-40">
                        Reprint Selected ({jobSelRecs.size})
                      </button>
                    )}
                    <button
                      onClick={() => reprintRecords(job, null)}
                      disabled={isSending}
                      className="text-xs text-slate-500 hover:text-blue-400 px-2 py-1 rounded hover:bg-slate-700 transition-colors disabled:opacity-40">
                      {isSending ? `${rs.done}/${rs.total}…` : 'Reprint All'}
                    </button>
                    <button onClick={() => deleteJob(job.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors w-7 h-7 flex items-center justify-center rounded hover:bg-slate-700"
                      title="Delete job">✕</button>
                  </div>
                </div>

                {/* Expanded records */}
                {isExpanded && detail && (
                  <div className="bg-slate-900/60 border-t border-b border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="text-xs text-slate-300 min-w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-900/80">
                            <th className="w-8 px-3 py-2 text-left border-b border-r border-slate-700">
                              <input type="checkbox"
                                checked={jobSelRecs.size === detail.records.length}
                                onChange={() => toggleAllRecs(job.id, detail.records.length)}
                                className="accent-blue-400" />
                            </th>
                            <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-500 font-semibold w-10">#</th>
                            {Object.keys(detail.records[0]?.vars || {}).map((k) => (
                              <th key={k} className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-500 font-semibold font-mono">{k}</th>
                            ))}
                            <th className="px-4 py-2 text-left border-b border-r border-slate-700 text-slate-500 font-semibold w-12">Qty</th>
                            <th className="px-4 py-2 text-left border-b border-slate-700 text-slate-500 font-semibold w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.records.map((rec, i) => {
                            const isChecked = jobSelRecs.has(i);
                            return (
                              <tr key={i}
                                className={`border-b border-slate-800/60 cursor-pointer transition-colors ${isChecked ? 'bg-blue-950/20' : 'hover:bg-slate-800/20'}`}
                                onClick={() => toggleRec(job.id, i)}>
                                <td className="px-3 py-1.5 border-r border-slate-800" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" checked={isChecked} onChange={() => toggleRec(job.id, i)} className="accent-blue-400" />
                                </td>
                                <td className="px-4 py-1.5 border-r border-slate-800 text-slate-600">{i + 1}</td>
                                {Object.values(rec.vars || {}).map((v, vi) => (
                                  <td key={vi} className="px-4 py-1.5 border-r border-slate-800 text-slate-300 font-mono">{v}</td>
                                ))}
                                <td className="px-4 py-1.5 border-r border-slate-800">{rec.qty}</td>
                                <td className="px-4 py-1.5">
                                  {rec.status === 'printed'
                                    ? <span className="text-green-400">✓ Printed</span>
                                    : <span className="text-red-400">✗ Failed</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Selection hint */}
                    <div className="px-4 py-2 text-[10px] text-slate-600 border-t border-slate-800">
                      {jobSelRecs.size > 0
                        ? `${jobSelRecs.size} record${jobSelRecs.size !== 1 ? 's' : ''} selected — click "Reprint Selected" above`
                        : 'Click rows or use checkboxes to select records for reprint'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function SideSection({ label, children }) {
  return (
    <div className="px-4 py-3 border-b border-slate-700 shrink-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  );
}

function StatusBadge({ printed = 0, failed = 0 }) {
  if (failed === 0)  return <span className="text-[10px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">{printed} printed</span>;
  if (printed === 0) return <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">{failed} failed</span>;
  return <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded">{printed} ok · {failed} failed</span>;
}
