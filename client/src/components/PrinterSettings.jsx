import React, { useState, useEffect } from 'react';
import * as qzTray from '../lib/qzTray.js';

export default function PrinterSettings({ isOpen, onClose }) {
  const [printers, setPrinters] = useState([]);
  const [tab, setTab] = useState('tcp'); // 'tcp' | 'qz'

  // TCP form
  const [name, setName]   = useState('');
  const [ip, setIp]       = useState('');
  const [port, setPort]   = useState('9100');
  const [error, setError] = useState('');

  // QZ form
  const [qzConnected, setQzConnected]     = useState(false);
  const [qzPrinters, setQzPrinters]       = useState([]);
  const [qzSelected, setQzSelected]       = useState('');
  const [qzName, setQzName]               = useState('');
  const [qzError, setQzError]             = useState('');
  const [qzConnecting, setQzConnecting]   = useState(false);

  useEffect(() => {
    if (isOpen) {
      load();
      setQzConnected(qzTray.isConnected());
    }
  }, [isOpen]);

  async function load() {
    try {
      const data = await fetch('/api/printers').then((r) => r.json());
      setPrinters(data);
    } catch {}
  }

  async function handleTcpAdd(e) {
    e.preventDefault();
    setError('');
    const trimName = name.trim();
    const trimIp   = ip.trim();
    if (!trimName || !trimIp) { setError('Name and IP are required.'); return; }
    await fetch('/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimName, ip: trimIp, port: parseInt(port) || 9100, type: 'tcp' }),
    });
    setName(''); setIp(''); setPort('9100');
    load();
  }

  async function handleQzConnect() {
    setQzConnecting(true);
    setQzError('');
    try {
      const list = await qzTray.listPrinters();
      setQzPrinters(list);
      setQzSelected(list[0] ?? '');
      setQzConnected(true);
    } catch (e) {
      setQzError(`Could not connect to QZ Tray: ${e.message}. Make sure QZ Tray is running.`);
    }
    setQzConnecting(false);
  }

  async function handleQzAdd(e) {
    e.preventDefault();
    setQzError('');
    const trimName = qzName.trim();
    if (!trimName || !qzSelected) { setQzError('Select a printer and enter a display name.'); return; }
    await fetch('/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimName, printerName: qzSelected, type: 'qz' }),
    });
    setQzName('');
    load();
  }

  async function handleDelete(printerName) {
    await fetch(`/api/printers/${encodeURIComponent(printerName)}`, { method: 'DELETE' });
    load();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[420px] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Printers</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-5">

          {/* Saved printers */}
          <div className="space-y-2">
            {printers.length === 0 && (
              <p className="text-sm text-slate-500">No printers added yet.</p>
            )}
            {printers.map((p) => (
              <div key={p.name} className="flex items-center justify-between bg-slate-700 rounded px-3 py-2.5">
                <div>
                  <div className="text-sm text-slate-100 font-medium">{p.name}</div>
                  <div className="text-xs font-mono text-slate-400">
                    {p.type === 'qz'
                      ? `QZ Tray — ${p.printerName}`
                      : `${p.ip} : ${p.port}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p.name)}
                  className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
                  title="Remove printer"
                >✕</button>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-700" />

          {/* Tab selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab('tcp')}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === 'tcp'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >Network (TCP)</button>
            <button
              onClick={() => setTab('qz')}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === 'qz'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >Local (QZ Tray)</button>
          </div>

          {/* TCP Add Form */}
          {tab === 'tcp' && (
            <form onSubmit={handleTcpAdd} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Name</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. ZebraTag, Front Desk, Shipping"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 mb-1 block">IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-400 mb-1 block">Port</label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded text-sm transition-colors"
              >
                + Add Network Printer
              </button>
            </form>
          )}

          {/* QZ Tray Add Form */}
          {tab === 'qz' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Print to locally-installed Windows printers via{' '}
                <span className="text-blue-400">QZ Tray</span>.
                Make sure QZ Tray is installed and running on this machine.
              </p>

              {!qzConnected ? (
                <button
                  onClick={handleQzConnect}
                  disabled={qzConnecting}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-medium py-2 rounded text-sm transition-colors"
                >
                  {qzConnecting ? 'Connecting…' : 'Connect to QZ Tray'}
                </button>
              ) : (
                <form onSubmit={handleQzAdd} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Select Printer</label>
                    <select
                      value={qzSelected}
                      onChange={(e) => setQzSelected(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      {qzPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. ZebraTag"
                      value={qzName}
                      onChange={(e) => setQzName(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded text-sm transition-colors"
                  >
                    + Add Local Printer
                  </button>
                </form>
              )}

              {qzError && <p className="text-xs text-red-400">{qzError}</p>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
