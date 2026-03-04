import React, { useState, useEffect } from 'react';
import { extractTemplateVars } from '../lib/zplGenerator.js';
import * as qzTray from '../lib/qzTray.js';

export default function PrintDialog({ isOpen, onClose, onManagePrinters, canvasObjects, labelSettings, generateZpl }) {
  const [printers, setPrinters]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [copies, setCopies]             = useState(1);
  const [templateValues, setTemplateValues] = useState({});
  const [status, setStatus]             = useState(null);
  const [printing, setPrinting]         = useState(false);

  const templateVars = extractTemplateVars(canvasObjects);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
    const init = {};
    templateVars.forEach((v) => { init[v] = ''; });
    setTemplateValues(init);

    fetch('/api/printers')
      .then((r) => r.json())
      .then((data) => {
        setPrinters(data);
        setSelected((prev) => {
          if (prev && data.find((p) => p.name === prev.name)) return prev;
          return data[0] ?? null;
        });
      })
      .catch(() => {});
  }, [isOpen]);

  async function handlePrint() {
    if (!selected) return;
    setPrinting(true);
    setStatus(null);
    try {
      const zpl = generateZpl(canvasObjects, labelSettings, templateValues);
      const n = Math.max(1, parseInt(copies) || 1);
      const finalZpl = n > 1 ? zpl.replace(/(\^XZ)/i, `^PQ${n},0,1,Y$1`) : zpl;

      if (selected.type === 'qz') {
        await qzTray.printRaw(selected.printerName, finalZpl);
        setStatus({ ok: true, msg: `Sent to ${selected.name}` });
      } else {
        const resp = await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zpl: finalZpl,
            printerIp:   selected.ip,
            printerPort: selected.port,
            copies: 1, // ^PQ already injected above
          }),
        });
        const data = await resp.json();
        setStatus(resp.ok
          ? { ok: true,  msg: `Sent to ${selected.name}` }
          : { ok: false, msg: data.error || 'Print failed.' });
      }
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    }
    setPrinting(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[380px] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Print Label</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">

          {/* Printer list */}
          {printers.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-slate-400">No printers configured.</p>
              <button
                onClick={() => { onClose(); onManagePrinters(); }}
                className="text-sm text-blue-400 hover:text-blue-300 underline"
              >
                Set up printers →
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {printers.map((p) => (
                <label key={p.name}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded border cursor-pointer transition-colors ${
                    selected?.name === p.name
                      ? 'bg-blue-700 border-blue-500'
                      : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="printer"
                    className="accent-blue-400"
                    checked={selected?.name === p.name}
                    onChange={() => setSelected(p)}
                  />
                  <div>
                    <div className="text-sm text-slate-100 font-medium">{p.name}</div>
                    <div className="text-xs font-mono text-slate-400">
                      {p.type === 'qz'
                        ? `QZ Tray — ${p.printerName}`
                        : `${p.ip} : ${p.port}`}
                    </div>
                  </div>
                </label>
              ))}
              <button
                onClick={() => { onClose(); onManagePrinters(); }}
                className="text-xs text-slate-500 hover:text-slate-300 mt-1"
              >
                + Manage printers
              </button>
            </div>
          )}

          {/* Template variables */}
          {templateVars.length > 0 && (
            <>
              <div className="border-t border-slate-700" />
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Variables</h3>
                {templateVars.map((v) => (
                  <div key={v} className="flex items-center gap-3">
                    <label className="text-xs text-slate-400 w-28 shrink-0 font-mono">{`{{${v}}}`}</label>
                    <input
                      type="text"
                      value={templateValues[v] ?? ''}
                      onChange={(e) => setTemplateValues((p) => ({ ...p, [v]: e.target.value }))}
                      placeholder={v}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Copies */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">Copies</label>
            <input
              type="number" min={1} max={9999} value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status */}
          {status && (
            <div className={`text-sm rounded px-3 py-2 ${
              status.ok ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              {status.msg}
            </div>
          )}
        </div>

        {/* Print button */}
        <div className="px-5 pb-4 space-y-2">
          <button
            onClick={handlePrint}
            disabled={!selected || printing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded transition-colors"
          >
            {printing ? 'Sending…' : selected ? `Print to ${selected.name}` : 'No printer selected'}
          </button>
        </div>
      </div>
    </div>
  );
}
