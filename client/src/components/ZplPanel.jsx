import React, { useState, useEffect, useRef } from 'react';

export default function ZplPanel({ zplCode, labelSettings, onImportZpl, onSaveZplToLibrary }) {
  const [previewUrl, setPreviewUrl]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [showPreview, setShowPreview]   = useState(false);

  const [localZpl, setLocalZpl]         = useState(zplCode || '');
  const [userEdited, setUserEdited]     = useState(false);

  const [copied, setCopied]             = useState(false);
  const [pasted, setPasted]             = useState(false);
  const [saveName, setSaveName]         = useState('');
  const [saveStatus, setSaveStatus]     = useState(null); // null | 'saving' | 'saved' | 'error'
  const [applyStatus, setApplyStatus]   = useState(null); // null | 'done'

  const debounceRef = useRef(null);
  const textareaRef = useRef(null);

  // Sync textarea from canvas — but only when user hasn't manually edited
  useEffect(() => {
    if (!userEdited) setLocalZpl(zplCode || '');
  }, [zplCode, userEdited]);

  // Debounced preview on localZpl change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (localZpl && showPreview) fetchPreview(localZpl);
    }, 600);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localZpl, showPreview]);

  async function fetchPreview(zpl) {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const resp = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zpl,
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

  // ── Clipboard ─────────────────────────────────────────────────────────────

  function copyZpl() {
    if (!localZpl) return;
    const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(localZpl).then(finish).catch(() => fallbackCopy(localZpl, finish));
    } else {
      fallbackCopy(localZpl, finish);
    }
  }

  function fallbackCopy(text, onSuccess) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try { document.execCommand('copy'); onSuccess(); } catch { /* ignore */ }
    document.body.removeChild(el);
  }

  function pasteFromClipboard() {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then((text) => {
        if (!text.trim()) return;
        setLocalZpl(text);
        setUserEdited(true);
        setPasted(true);
        setTimeout(() => setPasted(false), 1500);
        textareaRef.current?.focus();
      }).catch(() => textareaRef.current?.focus());
    } else {
      textareaRef.current?.focus();
    }
  }

  // ── Apply / Save ──────────────────────────────────────────────────────────

  function handleApplyToCanvas() {
    if (!localZpl.trim()) return;
    onImportZpl(localZpl);
    setUserEdited(false);
    setApplyStatus('done');
    setTimeout(() => setApplyStatus(null), 1500);
  }

  async function handleSave() {
    if (!localZpl.trim()) return;
    const name = saveName.trim() || labelSettings?.labelName || 'Untitled ZPL';
    setSaveStatus('saving');
    try {
      await onSaveZplToLibrary(localZpl, name);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  }

  function handleRevert() {
    setLocalZpl(zplCode || '');
    setUserEdited(false);
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ZPL</span>
          {userEdited && (
            <span className="text-[10px] text-amber-400 font-semibold">● edited</span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={copyZpl}
            className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button onClick={pasteFromClipboard}
            className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">
            {pasted ? '✓ Pasted' : 'Paste'}
          </button>
          <button onClick={() => { setShowPreview((v) => !v); if (!showPreview) fetchPreview(localZpl); }}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              showPreview
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>
            Preview {showPreview ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Editable ZPL field ── */}
      <textarea
        ref={textareaRef}
        value={localZpl}
        onChange={(e) => { setLocalZpl(e.target.value); setUserEdited(true); }}
        placeholder={`^XA\n^FO50,50^A0N,30,0^FDHello World^FS\n^XZ`}
        className="flex-1 min-h-0 w-full bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-blue-200 resize-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-slate-600 select-text"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />

      {/* ── Action bar ── */}
      <div className="flex gap-1.5 px-2 py-2 bg-slate-900 border-t border-slate-700 shrink-0">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={labelSettings?.labelName || 'Label name…'}
          className="min-w-0 flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        />
        {userEdited && (
          <button onClick={handleRevert}
            title="Discard edits and revert to canvas ZPL"
            className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 shrink-0">
            Revert
          </button>
        )}
        <button
          onClick={handleApplyToCanvas}
          disabled={!localZpl.trim() || !userEdited}
          title="Apply ZPL to canvas"
          className={`text-xs px-2.5 py-1 rounded font-semibold whitespace-nowrap transition-colors shrink-0 ${
            applyStatus === 'done'
              ? 'bg-green-700 text-white'
              : userEdited
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}>
          {applyStatus === 'done' ? '✓ Applied' : '→ Canvas'}
        </button>
        <button
          onClick={handleSave}
          disabled={!localZpl.trim()}
          title="Save to label library"
          className={`text-xs px-2.5 py-1 rounded font-semibold whitespace-nowrap transition-colors shrink-0 ${
            saveStatus === 'saved'  ? 'bg-green-700 text-white'
            : saveStatus === 'error' ? 'bg-red-800 text-red-200'
            : 'bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white'
          }`}>
          {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
        </button>
      </div>

      {/* ── Labelary Preview (collapsible) ── */}
      {showPreview && (
        <div className="flex flex-col shrink-0 border-t border-slate-700" style={{ height: 180 }}>
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
