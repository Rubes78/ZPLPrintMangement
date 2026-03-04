import React, { useState, useEffect, useRef, useCallback } from 'react';
import { extractTemplateVars } from '../lib/zplGenerator.js';
import * as qzTray from '../lib/qzTray.js';

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(splitCsvLine);
  return { headers, rows };
}
function splitCsvLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

// ── Print a single ZPL string to a printer config ────────────────────────────
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
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${resp.status}`);
    }
  }
}

// ── Download CSV template ──────────────────────────────────────────────────────
function downloadCsvTemplate(templateVars, labelName) {
  const headers = [...templateVars, 'qty'];
  const exampleRow = templateVars.map((v) => `Example ${v}`).concat(['1']);
  const csv = [headers.join(','), exampleRow.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(labelName || 'label').replace(/[^a-z0-9]/gi, '_')}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BatchPrintDialog({
  isOpen, onClose,
  canvasObjects, labelSettings, currentLabelId, generateZpl,
}) {
  const [tab, setTab] = useState('import');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col"
        style={{ width: '90vw', maxWidth: 1100, height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-slate-100">Import &amp; Print</span>
            <div className="flex bg-slate-800 rounded p-0.5 gap-0.5">
              {['import', 'history'].map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {t === 'import' ? 'Import & Print' : 'Print History'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          {tab === 'import'
            ? <ImportTab canvasObjects={canvasObjects} labelSettings={labelSettings} currentLabelId={currentLabelId} generateZpl={generateZpl} />
            : <HistoryTab generateZpl={generateZpl} />
          }
        </div>
      </div>
    </div>
  );
}

// ── Import & Print Tab ────────────────────────────────────────────────────────
function ImportTab({ canvasObjects, labelSettings, currentLabelId, generateZpl }) {
  const [csvData, setCsvData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [qtyColumn, setQtyColumn] = useState('');
  const [defaultQty, setDefaultQty] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [rowStatuses, setRowStatuses] = useState({});
  const fileRef = useRef(null);

  const templateVars = extractTemplateVars(canvasObjects);

  useEffect(() => {
    fetch('/api/printers').then((r) => r.json()).then((data) => {
      setPrinters(data);
      setPrinter((prev) => (prev && data.find((p) => p.name === prev.name)) ? prev : (data[0] ?? null));
    }).catch(() => {});
  }, []);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCsv(e.target.result);
      setCsvData(parsed);
      setSelected(new Set(parsed.rows.map((_, i) => i)));
      setRowStatuses({});
      setProgress(null);
      // Auto-map by name match
      const autoMap = {};
      templateVars.forEach((v) => {
        const match = parsed.headers.find((h) => h.toLowerCase() === v.toLowerCase());
        if (match) autoMap[v] = match;
      });
      setMapping(autoMap);
      // Auto-detect qty column
      const qtyCol = parsed.headers.find((h) => /^(qty|quantity|copies|count)$/i.test(h));
      setQtyColumn(qtyCol || '');
    };
    reader.readAsText(file);
  }

  function getVarsForRow(row) {
    const vars = {};
    templateVars.forEach((v) => {
      const col = mapping[v];
      if (col) {
        const idx = csvData.headers.indexOf(col);
        vars[v] = idx >= 0 ? (row[idx] ?? '') : '';
      }
    });
    return vars;
  }

  function getQtyForRow(row) {
    if (qtyColumn) {
      const idx = csvData.headers.indexOf(qtyColumn);
      const val = parseInt(row[idx] ?? '', 10);
      return isNaN(val) || val < 1 ? defaultQty : val;
    }
    return defaultQty;
  }

  async function handlePrint() {
    if (!csvData || !printer) return;
    const rows = csvData.rows;
    const selectedRows = rows.map((r, i) => ({ row: r, idx: i })).filter(({ idx }) => selected.has(idx));
    if (selectedRows.length === 0) return;

    setPrinting(true);
    const newStatuses = {};
    selectedRows.forEach(({ idx }) => { newStatuses[idx] = 'pending'; });
    setRowStatuses(newStatuses);
    setProgress({ done: 0, total: selectedRows.length, errors: 0 });

    const jobRecords = [];
    let done = 0; let errors = 0;

    for (const { row, idx } of selectedRows) {
      const vars = getVarsForRow(row);
      const qty = getQtyForRow(row);
      let status = 'printed';
      try {
        const zpl = generateZpl(canvasObjects, labelSettings, vars);
        const finalZpl = qty > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${qty},0,1,Y$1`) : zpl;
        await sendZpl(finalZpl, printer);
      } catch {
        status = 'failed';
        errors++;
      }
      done++;
      newStatuses[idx] = status;
      setRowStatuses({ ...newStatuses });
      setProgress({ done, total: selectedRows.length, errors });
      jobRecords.push({ vars, qty, status });
    }

    // Save to history
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelId: currentLabelId,
          labelName: labelSettings.labelName,
          labelSettings,
          zplTemplate: generateZpl(canvasObjects, labelSettings, {}),
          printer: { name: printer.name, type: printer.type, ip: printer.ip, port: printer.port, printerName: printer.printerName },
          records: jobRecords,
          totalPrinted: jobRecords.filter((r) => r.status === 'printed').length,
          totalFailed: errors,
        }),
      });
    } catch { /* history save failure is non-critical */ }

    setPrinting(false);
  }

  const allSelected = csvData && selected.size === csvData.rows.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(csvData.rows.map((_, i) => i)));
  };
  const toggleRow = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0">

      {/* Left sidebar — setup */}
      <div className="w-64 shrink-0 border-r border-slate-700 flex flex-col overflow-y-auto">

        {/* Label info */}
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Label</p>
          <p className="text-sm font-medium text-slate-200">{labelSettings.labelName || 'Untitled'}</p>
          <p className="text-xs text-slate-400">{labelSettings.widthInches}"×{labelSettings.heightInches}" · {labelSettings.dpi} dpi</p>
          {templateVars.length === 0 && (
            <p className="text-xs text-amber-400 mt-1">No template variables found on this label.</p>
          )}
        </div>

        {/* Download CSV template */}
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">CSV Template</p>
          <button
            onClick={() => downloadCsvTemplate(templateVars, labelSettings.labelName)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-2 rounded border border-slate-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download CSV Template
          </button>
          {templateVars.length > 0 && (
            <p className="text-[10px] text-slate-500 mt-1">Columns: {[...templateVars, 'qty'].join(', ')}</p>
          )}
        </div>

        {/* File upload */}
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">1. Upload CSV</p>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-2 rounded border border-slate-600 border-dashed transition-colors">
            {csvData ? `✓ ${csvData.rows.length} rows, ${csvData.headers.length} columns` : 'Choose file…'}
          </button>
          {csvData && (
            <p className="text-[10px] text-slate-500 mt-1">Columns: {csvData.headers.join(', ')}</p>
          )}
        </div>

        {/* Field mapping */}
        {csvData && templateVars.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">2. Map Fields</p>
            <div className="space-y-2">
              {templateVars.map((v) => (
                <div key={v}>
                  <label className="text-[10px] text-amber-300 font-mono block mb-0.5">{`{{${v}}}`}</label>
                  <select value={mapping[v] ?? ''} onChange={(e) => setMapping((p) => ({ ...p, [v]: e.target.value || undefined }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                    <option value="">(use variable name)</option>
                    {csvData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        {csvData && (
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">3. Quantity</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">From column</label>
                <select value={qtyColumn} onChange={(e) => setQtyColumn(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                  <option value="">(none — use default)</option>
                  {csvData.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">{qtyColumn ? 'Fallback default' : 'Default copies'}</label>
                <input type="number" min={1} max={9999} value={defaultQty}
                  onChange={(e) => setDefaultQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Printer */}
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{csvData ? '4.' : '2.'} Printer</p>
          {printers.length === 0
            ? <p className="text-xs text-slate-500">No printers configured.</p>
            : printers.map((p) => (
              <label key={p.name} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs mb-1 transition-colors ${printer?.name === p.name ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                <input type="radio" name="batchPrinter" checked={printer?.name === p.name} onChange={() => setPrinter(p)} className="accent-blue-400" />
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[10px] font-mono text-slate-400">{p.type === 'qz' ? `QZ — ${p.printerName}` : `${p.ip}:${p.port}`}</div>
                </div>
              </label>
            ))
          }
        </div>

        {/* Progress */}
        {progress && (
          <div className="px-4 py-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{progress.done}/{progress.total} sent</span>
              {progress.errors > 0 && <span className="text-red-400">{progress.errors} failed</span>}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${progress.errors > 0 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            {progress.done === progress.total && (
              <p className={`text-xs mt-1 ${progress.errors === 0 ? 'text-green-400' : 'text-amber-400'}`}>
                {progress.errors === 0 ? 'All printed successfully.' : `Done — ${progress.errors} failed.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right — data preview table */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!csvData ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-12 gap-3">
            <p className="text-4xl text-slate-700">📄</p>
            <p className="text-sm font-medium text-slate-400">Upload a CSV file to get started</p>
            <p className="text-xs text-slate-600 max-w-sm">
              First row should be column headers. Each subsequent row will print as one label.
              Headers matching your template variables will be mapped automatically.
            </p>
            {templateVars.length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-800 rounded px-3 py-2 font-mono">
                Expected columns: {templateVars.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Table toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-500" />
                  {allSelected ? 'Deselect all' : 'Select all'}
                </label>
                <span className="text-xs text-slate-500">{selected.size} of {csvData.rows.length} selected</span>
              </div>
              <button
                onClick={handlePrint}
                disabled={selected.size === 0 || !printer || printing}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors"
              >
                {printing ? `Printing… (${progress?.done ?? 0}/${progress?.total ?? 0})` : `Print Selected (${selected.size})`}
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-800 z-10">
                  <tr>
                    <th className="w-8 px-2 py-2 text-left border-b border-slate-700" />
                    <th className="w-16 px-2 py-2 text-left text-slate-400 font-semibold border-b border-slate-700">Preview</th>
                    {csvData.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-slate-400 font-semibold border-b border-slate-700 whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-3 py-2 text-left text-slate-400 font-semibold border-b border-slate-700 whitespace-nowrap">Qty</th>
                    <th className="w-16 px-2 py-2 text-left text-slate-400 font-semibold border-b border-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.map((row, i) => {
                    const qty = getQtyForRow(row);
                    const status = rowStatuses[i];
                    return (
                      <tr key={i} onClick={() => toggleRow(i)} className={`cursor-pointer border-b border-slate-800 transition-colors ${selected.has(i) ? 'bg-slate-800/60 hover:bg-slate-800' : 'hover:bg-slate-800/30'}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)}
                            onClick={(e) => e.stopPropagation()} className="accent-blue-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          <RowPreview
                            vars={getVarsForRow(row)}
                            qty={qty}
                            canvasObjects={canvasObjects}
                            labelSettings={labelSettings}
                            generateZpl={generateZpl}
                          />
                        </td>
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 text-slate-300 max-w-[180px] truncate" title={cell}>{cell}</td>
                        ))}
                        <td className="px-3 py-1.5 text-slate-400 text-center font-mono">{qty}</td>
                        <td className="px-2 py-1.5">
                          {status === 'printed' && <span className="text-green-400">✓</span>}
                          {status === 'failed'  && <span className="text-red-400">✗</span>}
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

// ── Per-row preview thumbnail (loads on demand) ───────────────────────────────
function RowPreview({ vars, qty, canvasObjects, labelSettings, generateZpl }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const zpl = generateZpl(canvasObjects, labelSettings, vars);
      const resp = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl, widthInches: labelSettings.widthInches, heightInches: labelSettings.heightInches, dpi: labelSettings.dpi }),
      });
      if (resp.ok) setSrc(URL.createObjectURL(await resp.blob()));
    } catch {}
    setLoading(false);
    setLoaded(true);
  }

  return (
    <div className="w-10 h-12 bg-slate-700 border border-slate-600 rounded flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={(e) => { e.stopPropagation(); load(); }} title="Click to load preview">
      {src
        ? <img src={src} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
        : loading
          ? <div className="w-3 h-3 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          : <span className="text-slate-600 text-[10px]">👁</span>
      }
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ generateZpl }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [jobDetail, setJobDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reprinting, setReprinting] = useState({});
  const [reprintStatus, setReprintStatus] = useState({});

  useEffect(() => {
    fetch('/api/jobs').then((r) => r.json()).then(setJobs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function loadDetail(jobId) {
    if (expanded === jobId) { setExpanded(null); setJobDetail(null); return; }
    setExpanded(jobId);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      setJobDetail(await res.json());
    } catch {}
    setLoadingDetail(false);
  }

  async function handleReprint(job, recordIndices) {
    const key = `${job.id}-${recordIndices.join(',')}`;
    setReprinting((p) => ({ ...p, [key]: true }));
    const printer = job.printer;
    const statuses = {};
    for (const idx of recordIndices) {
      const rec = jobDetail.records[idx];
      try {
        const zpl = generateZpl([], job.labelSettings, rec.vars, job.zplTemplate);
        const finalZpl = rec.qty > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${rec.qty},0,1,Y$1`) : zpl;
        await sendZpl(finalZpl, printer);
        statuses[idx] = 'ok';
      } catch {
        statuses[idx] = 'fail';
      }
    }
    setReprintStatus((p) => ({ ...p, ...statuses }));
    setReprinting((p) => ({ ...p, [key]: false }));
  }

  async function deleteJob(id) {
    if (!window.confirm('Delete this print job from history?')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    setJobs((p) => p.filter((j) => j.id !== id));
    if (expanded === id) { setExpanded(null); setJobDetail(null); }
  }

  if (loading) return <div className="flex items-center justify-center h-full text-sm text-slate-500 animate-pulse">Loading history…</div>;

  if (jobs.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
      <p className="text-3xl text-slate-700">🗂</p>
      <p className="text-sm text-slate-400">No print history yet.</p>
      <p className="text-xs text-slate-600">Each batch print job will appear here so you can review and reprint records.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
      {jobs.map((job) => {
        const isOpen = expanded === job.id;
        return (
          <div key={job.id} className="group">
            {/* Job summary row */}
            <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
              onClick={() => loadDetail(job.id)}>
              <span className="text-slate-500 text-xs">{isOpen ? '▼' : '▶'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-200">{job.labelName || 'Untitled'}</span>
                  <span className="text-xs text-slate-500">{job.recordCount} record{job.recordCount !== 1 ? 's' : ''}</span>
                  {job.totalFailed > 0 && <span className="text-xs text-red-400">{job.totalFailed} failed</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500">{new Date(job.createdAt).toLocaleString()}</span>
                  {job.printer && <span className="text-xs text-slate-600 font-mono">{job.printer.name}</span>}
                  <span className="text-xs text-slate-600">{job.labelSettings?.widthInches}"×{job.labelSettings?.heightInches}"</span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 text-xs transition-opacity px-1">✕</button>
            </div>

            {/* Expanded records */}
            {isOpen && (
              <div className="border-t border-slate-800 bg-slate-950/30">
                {loadingDetail ? (
                  <p className="text-xs text-slate-500 px-5 py-4 animate-pulse">Loading records…</p>
                ) : jobDetail && (
                  <>
                    <div className="flex items-center justify-between px-5 py-2 border-b border-slate-800 bg-slate-800/30">
                      <span className="text-xs text-slate-400 font-semibold">{jobDetail.records.length} records</span>
                      <button
                        onClick={() => handleReprint(jobDetail, jobDetail.records.map((_, i) => i))}
                        className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        Reprint All
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="px-4 py-2 text-left text-slate-500 font-semibold">#</th>
                            {Object.keys(jobDetail.records[0]?.vars ?? {}).map((k) => (
                              <th key={k} className="px-4 py-2 text-left text-slate-500 font-semibold font-mono">{`{{${k}}}`}</th>
                            ))}
                            <th className="px-4 py-2 text-left text-slate-500 font-semibold">Qty</th>
                            <th className="px-4 py-2 text-left text-slate-500 font-semibold">Status</th>
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {jobDetail.records.map((rec, i) => (
                            <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                              <td className="px-4 py-1.5 text-slate-600">{i + 1}</td>
                              {Object.values(rec.vars).map((v, j) => (
                                <td key={j} className="px-4 py-1.5 text-slate-300 max-w-[180px] truncate">{v}</td>
                              ))}
                              <td className="px-4 py-1.5 text-slate-400 font-mono">{rec.qty}</td>
                              <td className="px-4 py-1.5">
                                {reprintStatus[i] === 'ok'
                                  ? <span className="text-green-400">✓ Reprinted</span>
                                  : reprintStatus[i] === 'fail'
                                    ? <span className="text-red-400">✗ Failed</span>
                                    : rec.status === 'printed'
                                      ? <span className="text-slate-500">Printed</span>
                                      : <span className="text-red-400/70">Failed</span>
                                }
                              </td>
                              <td className="px-4 py-1.5">
                                <button
                                  onClick={() => handleReprint(jobDetail, [i])}
                                  disabled={reprinting[`${jobDetail.id}-${i}`]}
                                  className="text-[10px] px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors disabled:opacity-50"
                                >
                                  Reprint
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
