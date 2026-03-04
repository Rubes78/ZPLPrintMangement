import React, { useState, useEffect, useRef } from 'react';

// Color-code ZPL lines by type for readability
function colorLine(line) {
  const t = line.trimStart();
  if (!t) return 'text-slate-700';
  if (t.startsWith('^FX'))                       return 'text-slate-500 italic';       // comments
  if (t.startsWith('~'))                          return 'text-amber-400';              // persistent tilde cmds
  if (t.startsWith('^XA') || t.startsWith('^XZ')) return 'text-slate-200 font-bold';   // label delimiters
  if (/^\^(FO|FD|FT|FH|FS)/.test(t))            return 'text-emerald-400';            // field positioning/data
  if (/^\^B[C3QXZE]/.test(t))                    return 'text-cyan-400';              // barcode commands
  if (/^\^(GB|GF|GC|GS)/.test(t))               return 'text-purple-400';             // graphic commands
  if (/^\^(BY)/.test(t))                         return 'text-cyan-300';              // barcode width
  if (/^\^A/.test(t))                            return 'text-emerald-300';            // font commands
  return 'text-blue-300';                                                               // printer/header cmds
}

function ColoredZpl({ zplCode }) {
  if (!zplCode) {
    return (
      <p className="text-xs text-slate-600 p-3 italic">Add elements or printer settings to see ZPL…</p>
    );
  }
  const lines = zplCode.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={`block leading-5 ${colorLine(line)}`}>{line || '\u00A0'}</span>
      ))}
    </>
  );
}

export default function ZplPanel({ zplCode, labelSettings, onImportZpl, onSaveZplToLibrary }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [showPreview, setShowPreview] = useState(true);
  const debounceRef = useRef(null);

  // Auto-preview on ZPL change (debounced 600ms)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (zplCode && showPreview) fetchPreview();
    }, 600);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zplCode, showPreview]);

  async function fetchPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const resp = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zpl: zplCode,
          widthInches: labelSettings.widthInches,
          heightInches: labelSettings.heightInches,
          dpi: labelSettings.dpi,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  function copyZpl() {
    navigator.clipboard.writeText(zplCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleImport() {
    if (!importText.trim()) return;
    onImportZpl(importText);
    setImportOpen(false);
    setImportText('');
  }

  async function handleSaveZpl() {
    if (!importText.trim()) return;
    const name = saveName.trim() || labelSettings?.labelName || 'Untitled ZPL';
    setSaveStatus('saving');
    try {
      await onSaveZplToLibrary(importText, name);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
      setImportOpen(false);
      setImportText('');
      setSaveName('');
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  }

  function openImport() {
    setSaveName(labelSettings?.labelName || '');
    setImportOpen((v) => !v);
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ZPL Output</span>
        <div className="flex gap-1.5">
          <button onClick={copyZpl}
            className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button onClick={() => { setShowPreview((v) => !v); if (!showPreview) fetchPreview(); }}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              showPreview
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>
            Preview {showPreview ? '▲' : '▼'}
          </button>
          <button onClick={openImport}
            title="Paste ZPL to import into editor"
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              importOpen
                ? 'bg-amber-700 border-amber-500 text-white'
                : 'bg-slate-700 hover:bg-amber-800 border-slate-600 text-slate-300 hover:text-amber-300'}`}>
            {importOpen ? '✕ Cancel' : '↑ Paste ZPL'}
          </button>
        </div>
      </div>

      {/* ── Color-coded ZPL display ── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950 px-3 py-2 font-mono text-xs leading-5 select-text">
        <ColoredZpl zplCode={zplCode} />
      </div>

      {/* ── Color legend ── */}
      <div className="flex gap-3 px-3 py-1.5 bg-slate-900 border-t border-slate-700 border-b border-slate-700 shrink-0 flex-wrap">
        <span className="text-[10px] text-amber-400">~ persistent</span>
        <span className="text-[10px] text-blue-300">^ printer cmd</span>
        <span className="text-[10px] text-emerald-400">^ field/text</span>
        <span className="text-[10px] text-cyan-400">^ barcode</span>
        <span className="text-[10px] text-purple-400">^ graphic</span>
        <span className="text-[10px] text-slate-500 italic">^FX comment</span>
      </div>

      {/* ── Paste ZPL panel (collapsible) ── */}
      {importOpen && (
        <div className="border-b border-amber-700/50 bg-slate-900 shrink-0">
          <div className="px-3 py-1.5 bg-amber-900/30 border-b border-amber-700/40">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Paste ZPL</span>
          </div>
          <div className="p-2 flex flex-col gap-2">
            <textarea
              autoFocus
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Paste ZPL here…\n\n^XA\n^FO50,50^A0N,30,0^FDHello World^FS\n^XZ`}
              className="w-full bg-slate-800 border border-slate-600 rounded font-mono text-xs text-slate-200 p-2 focus:outline-none focus:border-amber-500 resize-none"
              style={{ height: 110 }}
              spellCheck={false}
            />
            <div className="flex gap-2">
              <button onClick={handleImport} disabled={!importText.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold py-1.5 rounded transition-colors">
                Import to Canvas
              </button>
              <button onClick={() => setImportText('')}
                className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400">
                Clear
              </button>
            </div>
            <div className="border-t border-slate-700/60 pt-2 flex flex-col gap-1.5">
              <span className="text-xs text-slate-500">Or save ZPL directly to library:</span>
              <div className="flex gap-2">
                <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Label name…"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
                <button onClick={handleSaveZpl} disabled={!importText.trim()}
                  className={`text-xs px-3 py-1 rounded font-semibold transition-colors shrink-0 ${
                    saveStatus === 'saved' ? 'bg-green-700 text-white'
                      : saveStatus === 'error' ? 'bg-red-800 text-red-200'
                      : 'bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white'}`}>
                  {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error' : 'Save to Library'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Labelary Preview (collapsible) ── */}
      {showPreview && (
        <div className="flex flex-col shrink-0" style={{ height: 180 }}>
          <div className="flex items-center justify-between px-3 py-1 bg-slate-800 shrink-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Preview</span>
            {previewLoading && <span className="text-xs text-blue-400 animate-pulse">Rendering…</span>}
            {previewError && <span className="text-xs text-red-400">Error</span>}
          </div>
          <div className="bg-slate-900 flex items-center justify-center flex-1 overflow-hidden">
            {previewError && <p className="text-xs text-red-400 text-center px-2">{previewError}</p>}
            {!previewError && previewUrl && (
              <img src={previewUrl} alt="Label preview"
                className="max-w-full max-h-full border border-slate-600 bg-white"
                style={{ imageRendering: 'pixelated' }} />
            )}
            {!previewError && !previewUrl && !previewLoading && (
              <p className="text-xs text-slate-600 text-center">Add elements to see a preview</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
