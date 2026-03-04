import React, { useState, useEffect } from 'react';
import { extractTemplateVars } from '../lib/zplGenerator.js';
import * as qzTray from '../lib/qzTray.js';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export default function BatchPrintDialog({ isOpen, onClose, canvasObjects, labelSettings, generateZpl }) {
  const [printers, setPrinters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [progress, setProgress] = useState(null); // null | { done, total, errors }
  const [printing, setPrinting] = useState(false);

  const templateVars = extractTemplateVars(canvasObjects);

  useEffect(() => {
    if (!isOpen) return;
    setProgress(null);
    fetch('/api/printers')
      .then((r) => r.json())
      .then((data) => {
        setPrinters(data);
        setSelected((prev) => (prev && data.find((p) => p.name === prev.name)) ? prev : (data[0] ?? null));
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!csvText.trim()) { setParsed(null); return; }
    const result = parseCsv(csvText);
    setParsed(result);
    // Auto-map CSV headers to template vars by name (case-insensitive)
    const autoMap = {};
    templateVars.forEach((v) => {
      const match = result.headers.find((h) => h.toLowerCase() === v.toLowerCase());
      if (match) autoMap[v] = match;
    });
    setMapping(autoMap);
  }, [csvText]);

  async function sendZpl(zpl) {
    if (!selected) throw new Error('No printer selected');
    if (selected.type === 'qz') {
      await qzTray.printRaw(selected.printerName, zpl);
    } else {
      const resp = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl, printerIp: selected.ip, printerPort: selected.port, copies: 1 }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }
    }
  }

  async function handlePrintAll() {
    if (!parsed || !selected) return;
    setPrinting(true);
    const total = parsed.rows.length;
    let done = 0;
    let errors = 0;
    setProgress({ done, total, errors });

    for (const row of parsed.rows) {
      // Build variable values from row using mapping
      const vars = {};
      templateVars.forEach((v) => {
        const col = mapping[v];
        if (col) {
          const idx = parsed.headers.indexOf(col);
          vars[v] = idx >= 0 ? (row[idx] ?? '') : '';
        }
      });
      try {
        const zpl = generateZpl(canvasObjects, labelSettings, vars);
        await sendZpl(zpl);
      } catch {
        errors++;
      }
      done++;
      setProgress({ done, total, errors });
    }

    setPrinting(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[680px] max-w-[95vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Batch Print</h2>
            <p className="text-xs text-slate-400 mt-0.5">Paste CSV data to print one label per row</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left — CSV input */}
          <div className="flex flex-col w-[55%] border-r border-slate-700 p-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
                CSV Data
              </label>
              <p className="text-xs text-slate-500 mb-2">
                First row = column headers. Each subsequent row prints one label.
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"CompanyName,barcode\nAcme Corp,123456789\nFoo Inc,987654321"}
                rows={8}
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-xs font-mono text-blue-200 focus:outline-none focus:border-blue-500 resize-y"
                spellCheck={false}
              />
            </div>

            {/* Column → variable mapping */}
            {parsed && templateVars.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Map columns to variables
                </p>
                <div className="space-y-1.5">
                  {templateVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-amber-300 w-28 shrink-0">{`{{${v}}}`}</span>
                      <span className="text-xs text-slate-500">←</span>
                      <select
                        value={mapping[v] ?? ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [v]: e.target.value || undefined }))}
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">(not mapped — use variable name)</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — printer + preview + print */}
          <div className="flex flex-col w-[45%] p-4 gap-4 overflow-y-auto">

            {/* Printer */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Printer</p>
              {printers.length === 0 ? (
                <p className="text-xs text-slate-500">No printers configured.</p>
              ) : (
                <div className="space-y-1">
                  {printers.map((p) => (
                    <label key={p.name}
                      className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors text-xs ${
                        selected?.name === p.name
                          ? 'bg-blue-700 border-blue-500 text-white'
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200'
                      }`}
                    >
                      <input type="radio" name="batchPrinter" className="accent-blue-400"
                        checked={selected?.name === p.name} onChange={() => setSelected(p)} />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="font-mono text-slate-400 text-[10px]">
                          {p.type === 'qz' ? `QZ — ${p.printerName}` : `${p.ip}:${p.port}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Data preview */}
            {parsed && parsed.rows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Preview — {parsed.rows.length} label{parsed.rows.length !== 1 ? 's' : ''}
                </p>
                <div className="overflow-x-auto border border-slate-700 rounded">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-700">
                        {parsed.headers.map((h) => (
                          <th key={h} className="px-2 py-1 text-left text-slate-300 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-slate-700/60">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1 text-slate-300 truncate max-w-[100px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                      {parsed.rows.length > 5 && (
                        <tr className="border-t border-slate-700/60">
                          <td colSpan={parsed.headers.length} className="px-2 py-1 text-slate-500 italic">
                            … and {parsed.rows.length - 5} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{progress.done} / {progress.total} printed</span>
                  {progress.errors > 0 && <span className="text-red-400">{progress.errors} error{progress.errors !== 1 ? 's' : ''}</span>}
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${progress.errors > 0 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                {progress.done === progress.total && (
                  <p className={`text-xs ${progress.errors > 0 ? 'text-amber-300' : 'text-green-300'}`}>
                    {progress.errors === 0 ? 'All labels printed successfully.' : `Done — ${progress.errors} label${progress.errors !== 1 ? 's' : ''} failed.`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {parsed ? `${parsed.rows.length} rows loaded` : 'Paste CSV above to begin'}
          </p>
          <button
            onClick={handlePrintAll}
            disabled={!parsed || parsed.rows.length === 0 || !selected || printing}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-6 py-2 rounded text-sm transition-colors"
          >
            {printing ? `Printing… (${progress?.done ?? 0}/${progress?.total ?? 0})` : `Print All (${parsed?.rows.length ?? 0})`}
          </button>
        </div>
      </div>
    </div>
  );
}
