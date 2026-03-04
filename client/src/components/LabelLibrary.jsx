import React, { useState, useEffect, useCallback } from 'react';

export default function LabelLibrary({ isOpen, onClose, onLoad, onNew }) {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/labels');
      const data = await res.json();
      setLabels(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) fetchLabels();
  }, [isOpen, fetchLabels]);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/labels/${id}`, { method: 'DELETE' });
    setLabels((prev) => prev.filter((l) => l.id !== id));
  }

  const filtered = labels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Drawer */}
      <div
        className="bg-slate-800 border-r border-slate-600 h-full w-80 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h2 className="text-sm font-semibold text-slate-100">Label Library</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* New label */}
        <div className="px-3 py-2.5 border-b border-slate-700 shrink-0">
          <button
            onClick={() => { onNew(); onClose(); }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded transition-colors"
          >
            + New Label
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-700 shrink-0">
          <input
            type="text"
            placeholder="Search labels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Label list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-500 text-center py-8 animate-pulse">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-slate-500">
                {labels.length === 0 ? 'No labels saved yet.' : 'No results.'}
              </p>
              {labels.length === 0 && (
                <p className="text-xs text-slate-600 mt-1">
                  Build a label and click Save, or paste ZPL to get started.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-700/60">
              {filtered.map((label) => (
                <div
                  key={label.id}
                  className="px-3 py-3 hover:bg-slate-700/40 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-100 truncate">
                          {label.name}
                        </span>
                        {label.type === 'zpl' && (
                          <span className="text-xs px-1.5 py-0 rounded bg-amber-800/60 text-amber-400 border border-amber-700/50 shrink-0">
                            ZPL
                          </span>
                        )}
                      </div>
                      {label.labelSettings && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {label.labelSettings.widthInches}"×{label.labelSettings.heightInches}" · {label.labelSettings.dpi} dpi
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(label.updatedAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => { onLoad(label); onClose(); }}
                        className="text-xs px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDelete(label.id, label.name)}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-red-900 text-slate-400 hover:text-red-300 rounded transition-colors"
                        title="Delete label"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer count */}
        {labels.length > 0 && (
          <div className="px-3 py-2 border-t border-slate-700 shrink-0">
            <p className="text-xs text-slate-500 text-center">
              {filtered.length} of {labels.length} label{labels.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Click-outside backdrop (rest of screen) */}
      <div className="flex-1" />
    </div>
  );
}
