import React, { useEffect, useState } from 'react';

export default function PropertiesPanel({ selectedObject, labelSettings, onUpdate, onRebuildBarcode, onSettingsChange, onToggleLock }) {
  const [local, setLocal] = useState({});

  // Sync local state when selected object changes
  useEffect(() => {
    if (!selectedObject) { setLocal({}); return; }
    setLocal({
      left: Math.round(selectedObject.left ?? 0),
      top: Math.round(selectedObject.top ?? 0),
      width: Math.round((selectedObject.width ?? 100) * (selectedObject.scaleX ?? 1)),
      height: Math.round((selectedObject.height ?? 100) * (selectedObject.scaleY ?? 1)),
      angle: Math.round(selectedObject.angle ?? 0),
      text: selectedObject.text ?? '',
      fontSize: selectedObject.fontSize ?? 30,
      zplTextAlign: selectedObject.zplTextAlign ?? 'L',
      barcodeData: selectedObject.barcodeData ?? '',
      barcodeType: selectedObject.barcodeType ?? 'code128',
      barcodeHeight: selectedObject.barcodeHeight ?? 80,
      moduleWidth: selectedObject.moduleWidth ?? 2,
      showText: selectedObject.showText !== false,
      magnification: selectedObject.magnification ?? 4,
      fieldName: selectedObject.fieldName ?? '',
      strokeWidth: selectedObject.strokeWidth ?? 3,
      fill: selectedObject.fill === 'transparent' ? 'transparent' : (selectedObject.fill ?? '#000000'),
      locked: selectedObject.locked ?? false,
    });
  }, [selectedObject]);

  function applyGeometry() {
    const scaleX = local.width / Math.max(1, selectedObject.width ?? 100);
    const scaleY = local.height / Math.max(1, selectedObject.height ?? 100);
    onUpdate({ left: local.left, top: local.top, scaleX, scaleY, angle: local.angle });
  }

  function setL(key, val) {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }

  if (!selectedObject) {
    return <LabelSettings settings={labelSettings} onChange={onSettingsChange} />;
  }

  const type = selectedObject.elementType;

  return (
    <div className="overflow-y-auto h-full px-3 py-3 text-sm space-y-3">
      {/* ── Position & Size ── */}
      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X (dots)">
            <NumInput value={local.left} onChange={(v) => setL('left', v)}
              onBlur={applyGeometry} />
          </Field>
          <Field label="Y (dots)">
            <NumInput value={local.top} onChange={(v) => setL('top', v)}
              onBlur={applyGeometry} />
          </Field>
          <Field label="Width">
            <NumInput value={local.width} onChange={(v) => setL('width', v)}
              onBlur={applyGeometry} />
          </Field>
          <Field label="Height">
            <NumInput value={local.height} onChange={(v) => setL('height', v)}
              onBlur={applyGeometry} />
          </Field>
        </div>
        <Field label="Rotation">
          <div className="flex gap-1">
            {[0, 90, 180, 270].map((a) => (
              <button key={a}
                onClick={() => { setL('angle', a); onUpdate({ angle: a }); }}
                className={`flex-1 py-1 rounded text-xs border ${local.angle === a ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>
                {a}°
              </button>
            ))}
          </div>
        </Field>
        <Field label="">
          <button
            onClick={() => { setL('locked', !local.locked); onToggleLock?.(); }}
            title={local.locked ? 'Unlock element — allow moving and resizing' : 'Lock element — prevent accidental movement'}
            className={`w-full py-1 rounded text-xs border transition-colors ${
              local.locked
                ? 'bg-amber-700 border-amber-600 text-white'
                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
            }`}>
            {local.locked ? '🔒 Locked — click to unlock' : '🔓 Unlocked — click to lock'}
          </button>
        </Field>
      </Section>

      {/* ── Type-specific ── */}
      {type === 'text' && <TextProps local={local} setL={setL} onUpdate={onUpdate} />}
      {type === 'barcode' && <BarcodeProps local={local} setL={setL} onRebuild={onRebuildBarcode} />}
      {type === 'qrcode' && <QrProps local={local} setL={setL} onRebuild={onRebuildBarcode} />}
      {type === 'box' && <BoxProps local={local} setL={setL} onUpdate={onUpdate} />}
      {type === 'line' && <LineProps local={local} setL={setL} onUpdate={onUpdate} />}
      {type === 'image' && <p className="text-xs text-slate-400">Use the resize handles to scale the image. It will be converted to 1-bit black &amp; white in ZPL output.</p>}
    </div>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function TextProps({ local, setL, onUpdate }) {
  return (
    <Section title="Text">
      <Field label="Content (supports {{var}})">
        <textarea
          value={local.text}
          rows={3}
          onChange={(e) => { setL('text', e.target.value); onUpdate({ text: e.target.value }); }}
          className="prop-input resize-y min-h-[60px]"
        />
      </Field>
      <Field label="Font height (dots)">
        <NumInput value={local.fontSize} min={8} max={500}
          onChange={(v) => { setL('fontSize', v); onUpdate({ fontSize: v }); }} />
      </Field>
      <Field label="Print alignment">
        <div className="flex gap-1">
          {[['L','Left','⬅'], ['C','Center','↔'], ['R','Right','➡']].map(([val, title, icon]) => (
            <button key={val}
              title={`${title} — uses ZPL ^FB for printer-accurate alignment`}
              onClick={() => { setL('zplTextAlign', val); onUpdate({ zplTextAlign: val }); }}
              className={`flex-1 py-1 rounded text-xs border ${local.zplTextAlign === val ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>
              {icon} {title}
            </button>
          ))}
        </div>
        {local.zplTextAlign !== 'L' && (
          <p className="text-[10px] text-amber-400 mt-1">
            Printer centers using its own font — preview position is approximate.
          </p>
        )}
      </Field>
    </Section>
  );
}

function BarcodeProps({ local, setL, onRebuild }) {
  function rebuild(patch) {
    setL(Object.keys(patch)[0], Object.values(patch)[0]);
    onRebuild(patch);
  }

  return (
    <Section title="Barcode">
      <Field label="Type">
        <select value={local.barcodeType}
          onChange={(e) => rebuild({ barcodeType: e.target.value })}
          className="prop-input">
          <option value="code128">Code 128</option>
          <option value="code39">Code 39</option>
        </select>
      </Field>
      <Field label="Data (supports {{var}})">
        <input type="text" value={local.barcodeData}
          onChange={(e) => setL('barcodeData', e.target.value)}
          onBlur={() => onRebuild({ barcodeData: local.barcodeData })}
          className="prop-input" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Bar height (dots)">
          <NumInput value={local.barcodeHeight} min={20} max={600}
            onChange={(v) => setL('barcodeHeight', v)}
            onBlur={() => onRebuild({ barcodeHeight: local.barcodeHeight })} />
        </Field>
        <Field label="Module width (1–4)">
          <NumInput value={local.moduleWidth} min={1} max={4}
            onChange={(v) => setL('moduleWidth', v)}
            onBlur={() => onRebuild({ moduleWidth: local.moduleWidth })} />
        </Field>
      </div>
      <Field label="">
        <label className="flex items-center gap-2 text-slate-300 text-xs cursor-pointer">
          <input type="checkbox" checked={local.showText}
            onChange={(e) => rebuild({ showText: e.target.checked })}
            className="accent-blue-500" />
          Show text below barcode
        </label>
      </Field>
    </Section>
  );
}

function QrProps({ local, setL, onRebuild }) {
  function rebuild(patch) {
    setL(Object.keys(patch)[0], Object.values(patch)[0]);
    onRebuild(patch);
  }

  return (
    <Section title="QR Code">
      <Field label="Data (supports {{var}})">
        <input type="text" value={local.barcodeData}
          onChange={(e) => setL('barcodeData', e.target.value)}
          onBlur={() => onRebuild({ barcodeData: local.barcodeData })}
          className="prop-input" />
      </Field>
      <Field label="Magnification (1–10)">
        <NumInput value={local.magnification} min={1} max={10}
          onChange={(v) => setL('magnification', v)}
          onBlur={() => onRebuild({ magnification: local.magnification })} />
      </Field>
      <p className="text-xs text-slate-500">Higher magnification = larger QR code.</p>
    </Section>
  );
}

function BoxProps({ local, setL, onUpdate }) {
  return (
    <Section title="Box Style">
      <Field label="Border thickness (dots)">
        <NumInput value={local.strokeWidth} min={1} max={50}
          onChange={(v) => { setL('strokeWidth', v); onUpdate({ strokeWidth: v, strokeUniform: true }); }} />
      </Field>
      <Field label="Fill">
        <select
          value={local.fill}
          onChange={(e) => { setL('fill', e.target.value); onUpdate({ fill: e.target.value }); }}
          className="prop-input">
          <option value="transparent">None (outline only)</option>
          <option value="#000000">Black (solid)</option>
          <option value="#ffffff">White (block)</option>
        </select>
      </Field>
    </Section>
  );
}

function LineProps({ local, setL, onUpdate }) {
  return (
    <Section title="Line">
      <Field label="Thickness (dots)">
        <NumInput value={local.height} min={1} max={50}
          onChange={(v) => { setL('height', v); onUpdate({ height: v }); }} />
      </Field>
      <p className="text-xs text-slate-500">Drag the width handle to resize. ZPL outputs as ^GB (filled rectangle).</p>
    </Section>
  );
}

function LabelSettings({ settings, onChange }) {
  const s = settings;
  const set = (key, val) => onChange({ [key]: val === '' ? null : val });
  const num = (key) => (s[key] == null ? '' : s[key]);

  return (
    <div className="px-3 py-3 text-sm space-y-3">

      {/* Label Size */}
      <Section title="Label Size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width (in)">
            <NumInput value={s.widthInches} min={0.5} max={12} step={0.25}
              onChange={(v) => onChange({ widthInches: v })} />
          </Field>
          <Field label="Height (in)">
            <NumInput value={s.heightInches} min={0.5} max={24} step={0.25}
              onChange={(v) => onChange({ heightInches: v })} />
          </Field>
        </div>
        <Field label="Print Density">
          <select value={s.dpi} onChange={(e) => onChange({ dpi: parseInt(e.target.value) })} className="prop-input">
            <option value={203}>203 DPI  (8 dpmm)</option>
            <option value={300}>300 DPI  (12 dpmm)</option>
          </select>
        </Field>
        <p className="text-xs text-slate-500 pt-1">
          {s.widthInches}" × {s.heightInches}" = {Math.round(s.widthInches * s.dpi)} × {Math.round(s.heightInches * s.dpi)} dots
        </p>
      </Section>

      {/* ── Print Quality ── */}
      <Section title="Print Quality">
        <Field label="Darkness" zplCmd="~SD" hint="0=lightest · 30=darkest · blank=printer default">
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={30} step={1}
              value={num('darkness')}
              placeholder="default"
              onChange={(e) => set('darkness', e.target.value)}
              className="prop-input w-20" />
            {s.darkness != null && s.darkness !== '' && (
              <input type="range" min={0} max={30} step={1}
                value={+s.darkness}
                onChange={(e) => set('darkness', e.target.value)}
                className="flex-1 accent-blue-500" />
            )}
          </div>
        </Field>
        <Field label="Print Speed" zplCmd="^PR" hint="ips — inches per second">
          <select value={s.printSpeed ?? ''} onChange={(e) => set('printSpeed', e.target.value)} className="prop-input">
            <option value="">Default (printer setting)</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map((n) => (
              <option key={n} value={n}>{n} ips</option>
            ))}
          </select>
        </Field>
        <Field label="Media Type" zplCmd="^MT">
          <select value={s.mediaType ?? ''} onChange={(e) => set('mediaType', e.target.value)} className="prop-input">
            <option value="">Default (printer setting)</option>
            <option value="T">Thermal Transfer  (uses ribbon)</option>
            <option value="D">Direct Thermal  (no ribbon)</option>
          </select>
        </Field>
      </Section>

      {/* ── Media & Sensing ── */}
      <Section title="Media & Sensing">
        <Field label="Label / Sensing Type" zplCmd="^MN" hint="How the printer detects label gaps">
          <select value={s.mediaSensing ?? ''} onChange={(e) => set('mediaSensing', e.target.value)} className="prop-input">
            <option value="">Default (printer setting)</option>
            <option value="Y">Gap / Web  (die-cut labels)</option>
            <option value="M">Black Mark  (notched or marked)</option>
            <option value="N">Continuous  (no gap sensing)</option>
            <option value="A">Auto-detect</option>
            <option value="W">Continuous variable-length</option>
          </select>
        </Field>
        <Field label="Print Mode" zplCmd="^MM" hint="How labels are dispensed">
          <select value={s.printMode ?? ''} onChange={(e) => set('printMode', e.target.value)} className="prop-input">
            <option value="">Default (printer setting)</option>
            <option value="T">Tear-off</option>
            <option value="P">Peel-off  (with liner take-up)</option>
            <option value="R">Rewind</option>
            <option value="C">Cutter</option>
            <option value="A">Applicator</option>
          </select>
        </Field>
        <Field label="Feed / Backfeed" zplCmd="^MF" hint="Media motion after printing">
          <select value={s.mediaFeed ?? ''} onChange={(e) => set('mediaFeed', e.target.value)} className="prop-input">
            <option value="">Default (printer setting)</option>
            <option value="FF">Feed then Feed  (standard)</option>
            <option value="RF">Retract then Feed  (backfeed before print)</option>
            <option value="NF">No motion then Feed</option>
            <option value="FN">Feed then No motion</option>
            <option value="FO">Feed then Feed out  (present label)</option>
            <option value="RR">Retract then Retract</option>
          </select>
        </Field>
      </Section>

      {/* ── Position & Offset ── */}
      <Section title="Position & Offset">
        <Field label="Label Top" zplCmd="^LT" hint="Dots up (+) or down (−) · range −120…120">
          <input type="number" min={-120} max={120} step={1}
            value={num('labelTop')} placeholder="blank = 0"
            onChange={(e) => set('labelTop', e.target.value)}
            className="prop-input" />
        </Field>
        <Field label="Label Shift  (left/right)" zplCmd="^LS" hint="Dots right (+) or left (−)">
          <input type="number" min={-9999} max={9999} step={1}
            value={num('labelShift')} placeholder="blank = 0"
            onChange={(e) => set('labelShift', e.target.value)}
            className="prop-input" />
        </Field>
        <Field label="Tear-off Adjust" zplCmd="^TA" hint="Fine-tune tear/cut position · range −120…120">
          <input type="number" min={-120} max={120} step={1}
            value={num('tearOff')} placeholder="blank = 0"
            onChange={(e) => set('tearOff', e.target.value)}
            className="prop-input" />
        </Field>
      </Section>

      {/* ── Extra ZPL ── */}
      <Section title="Extra ZPL Commands">
        <p className="text-xs text-slate-500 -mt-1 mb-1">
          Injected inside <code className="bg-slate-700 px-1 rounded text-blue-300">^XA…^XZ</code> after the header commands above.
          Use for any ZPL not listed — one command per line.
        </p>
        <textarea
          value={s.extraCmds ?? ''}
          onChange={(e) => onChange({ extraCmds: e.target.value })}
          placeholder={"^JUS        ; save settings to NVM\n^JMA        ; apply NVM settings\n^POI        ; print image inverted\n^LRY        ; label reverse (white on black)"}
          rows={5}
          spellCheck={false}
          className="prop-input font-mono text-xs resize-y min-h-[80px]"
        />
      </Section>

    </div>
  );
}

// ── Primitive helpers ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="prop-section">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children, zplCmd, hint }) {
  return (
    <div>
      {label && (
        <label className="prop-label flex items-center justify-between gap-1 mb-1">
          <span className="truncate">{label}</span>
          {zplCmd && (
            <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-blue-300 font-mono shrink-0 border border-slate-600">
              {zplCmd}
            </code>
          )}
        </label>
      )}
      {hint && <p className="text-[10px] text-slate-500 mb-1 leading-snug">{hint}</p>}
      {children}
    </div>
  );
}

function NumInput({ value, onChange, onBlur, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onBlur={onBlur}
      className="prop-input"
    />
  );
}
