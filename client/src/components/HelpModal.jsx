import React, { useState } from 'react';

const SECTIONS = [
  { id: 'overview',    title: 'Overview' },
  { id: 'canvas',      title: 'Canvas & Toolbar' },
  { id: 'fields',      title: 'Fields & Elements' },
  { id: 'properties',  title: 'Properties Panel' },
  { id: 'label',       title: 'Label Settings' },
  { id: 'library',     title: 'Label Library' },
  { id: 'printing',    title: 'Printing' },
  { id: 'variables',   title: 'Template Variables' },
  { id: 'keyboard',    title: 'Keyboard Shortcuts' },
];

export default function HelpModal({ isOpen, onClose }) {
  const [active, setActive] = useState('overview');

  if (!isOpen) return null;

  function scrollTo(id) {
    setActive(id);
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[900px] max-w-[95vw] h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span className="font-bold text-blue-400 text-sm tracking-wide">ZPL Editor — User Manual</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none px-1 transition-colors"
          >×</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* TOC sidebar */}
          <nav className="w-44 shrink-0 border-r border-slate-700 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  active === s.id
                    ? 'bg-blue-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {s.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-300 space-y-10"
               onScroll={e => {
                 const container = e.currentTarget;
                 for (const s of SECTIONS) {
                   const el = document.getElementById(`help-${s.id}`);
                   if (el && el.offsetTop - container.scrollTop < 80) setActive(s.id);
                 }
               }}>

            {/* ── Overview ── */}
            <Section id="overview" title="Overview">
              <p>ZPL Editor is a browser-based designer for Zebra label printers. You design labels visually on a WYSIWYG canvas — the app generates ZPL (Zebra Programming Language) code in real time and can send it directly to a network printer or QZ Tray.</p>
              <p className="mt-2">The main layout has three columns:</p>
              <ul className="mt-1 space-y-1 list-disc list-inside text-slate-400">
                <li><Hl>Left panel</Hl> — Fields &amp; element palette</li>
                <li><Hl>Center</Hl> — Canvas (WYSIWYG design area)</li>
                <li><Hl>Right panel</Hl> — Properties, label settings, and ZPL output</li>
              </ul>
            </Section>

            {/* ── Canvas ── */}
            <Section id="canvas" title="Canvas & Toolbar">
              <p>The canvas represents your physical label at the configured size and DPI. One canvas dot = one ZPL dot. White background = the printable label surface.</p>

              <H3>Toolbar</H3>
              <p>The toolbar sits above the canvas and contains alignment buttons and the snap toggle.</p>
              <Table rows={[
                ['⬅ Align Left',          'Move selected element(s) to the left edge of the label'],
                ['↔ Center H',             'Center selected element(s) horizontally on the label'],
                ['➡ Align Right',          'Move selected element(s) to the right edge'],
                ['⬆ Align Top',            'Move selected element(s) to the top edge'],
                ['↕ Center V',             'Center selected element(s) vertically'],
                ['⬇ Align Bottom',         'Move selected element(s) to the bottom edge'],
                ['⊞ Grid ON / OFF',        'Toggle snap-to-grid (10 dot grid)'],
              ]} />

              <H3>Selecting & Moving</H3>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Click any element to select it — resize handles appear</li>
                <li>Drag to move; drag a corner handle to resize</li>
                <li>Hold <Kbd>Shift</Kbd> and click multiple elements to select a group, then align them all at once</li>
                <li>Double-click a text element to edit its content inline</li>
              </ul>

              <H3>Zoom</H3>
              <p>Use the <Hl>− / +</Hl> buttons in the header or <Hl>1:1</Hl> to reset. The canvas auto-fits when you change label size or DPI.</p>
            </Section>

            {/* ── Fields ── */}
            <Section id="fields" title="Fields & Elements">
              <H3>Fields (top of palette)</H3>
              <p>Fields are named template variables — placeholders that get filled in with real data at print time. Click a field button to place it on the canvas as a text element containing <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{FieldName}}`}</code>.</p>
              <p className="mt-1 text-slate-400">The <Hl>Barcode</Hl> row at the bottom of the fields section lets you place a <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{barcode}}`}</code> field as a Code 128, Code 39, or QR code.</p>

              <H3>Managing Fields</H3>
              <Table rows={[
                ['+  button',       'Add a new custom field'],
                ['✎  (hover)',      'Rename an existing field — press Enter to confirm, Escape to cancel'],
                ['×  (hover)',      'Delete a custom field (built-in fields cannot be deleted)'],
              ]} />

              <H3>Add Elements (bottom of palette)</H3>
              <Table rows={[
                ['T  Text',         'Static text — type any content, supports {{variables}}'],
                ['||| Code 128',    'Code 128 linear barcode'],
                ['||/ Code 39',     'Code 39 linear barcode'],
                ['▦  QR Code',      'QR Code 2D barcode'],
                ['□  Box',          'Outlined rectangle — useful for borders'],
                ['─  Line',         'Horizontal rule / separator'],
                ['🖼  Image',       'Upload a PNG/JPG — converted to 1-bit black &amp; white in ZPL'],
              ]} />
            </Section>

            {/* ── Properties ── */}
            <Section id="properties" title="Properties Panel">
              <p>Select any element on the canvas to see its properties in the right panel. The panel has two tabs:</p>

              <H3>Label tab</H3>
              <p>Shows the label settings (size, DPI, printer overrides) — same as the header controls but with more options.</p>

              <H3>Element / Text tab</H3>
              <p>Shows properties for the selected element.</p>
              <Table rows={[
                ['X / Y (dots)',      'Position of the element in ZPL dots from the top-left corner'],
                ['Width / Height',    'Dimensions in dots (drag handles on canvas also update these)'],
                ['Rotation',          '0°, 90°, 180°, or 270° rotation'],
                ['Content',           'Text content — can include {{variable}} placeholders'],
                ['Font height',       'Character height in dots'],
                ['Print alignment',   'L / C / R — uses ZPL ^FB to center/right-align text on the printer using the printer\'s own font metrics (more accurate than canvas centering for text)'],
                ['Barcode data',      'The value to encode — can be a {{variable}}'],
                ['Module width',      'Width of each barcode bar in dots (higher = wider barcode)'],
                ['Magnification',     'QR code module size — higher = larger QR code'],
              ]} />
            </Section>

            {/* ── Label Settings ── */}
            <Section id="label" title="Label Settings">
              <p>Label settings live in the header and the Label tab of the properties panel.</p>
              <Table rows={[
                ['Label name',      'Name shown in the library'],
                ['Preset size',     'Quick-select common label sizes'],
                ['W / H (inches)',  'Label width and height in inches'],
                ['DPI',             '203 or 300 — must match your printer\'s head resolution'],
                ['Orientation',     'Portrait / Landscape — swaps dimensions and rotates all elements'],
              ]} />

              <H3>Printer Overrides</H3>
              <p>In the Label tab you can optionally set printer-level commands that get injected into every print job for this label:</p>
              <Table rows={[
                ['Darkness',       '0–30 scale. Leave blank to use the printer\'s saved setting.'],
                ['Print Speed',    'ips (inches per second). Leave blank to use printer default.'],
                ['Media Type',     'Thermal Transfer (ribbon) or Direct Thermal (no ribbon)'],
                ['Media Sensing',  'How the printer detects label gaps: Gap, Black Mark, Continuous, Auto'],
                ['Print Mode',     'Tear-off, Peel, Rewind, or Cutter'],
                ['Label Top',      'Vertical position offset in dots (−120 to 120)'],
                ['Label Shift',    'Horizontal position offset in dots'],
              ]} />
            </Section>

            {/* ── Library ── */}
            <Section id="library" title="Label Library">
              <p>The library stores saved labels persistently on the server (survives container restarts).</p>

              <H3>Saving</H3>
              <p>Click <Hl>Save</Hl> in the header. If the label has never been saved, you will be prompted for a name. Subsequent saves overwrite the existing entry. The button shows <Hl>Saved ✓</Hl> in green when no unsaved changes exist.</p>

              <H3>Opening the Library</H3>
              <p>Click <Hl>Library</Hl> in the header to open the library drawer. Click any label to load it onto the canvas.</p>

              <H3>ZPL-only labels</H3>
              <p>You can also paste raw ZPL into the ZPL panel (bottom-right) and save it to the library without a canvas representation. These appear with a <Hl>ZPL</Hl> badge in the library.</p>

              <H3>Deleting</H3>
              <p>Hover a label in the library and click the <Hl>×</Hl> button to delete it.</p>
            </Section>

            {/* ── Printing ── */}
            <Section id="printing" title="Printing">
              <p>Click <Hl>Print</Hl> in the header to open the print dialog.</p>

              <H3>Printer types</H3>
              <Table rows={[
                ['TCP/IP',    'Direct network socket to the printer\'s IP address and port (default 9100). No driver required — ZPL is sent as raw bytes.'],
                ['QZ Tray',   'Desktop app that bridges the browser to locally installed printers. Required for USB or shared-network printers.'],
              ]} />

              <H3>Managing printers</H3>
              <p>Click <Hl>Printers</Hl> in the header to add, edit, or remove printer entries. Each printer needs a name, IP address, and port (9100 is standard for Zebra).</p>

              <H3>Template variables at print time</H3>
              <p>If your label contains <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{fields}}`}</code>, the print dialog shows an input for each variable. Leave a field blank to print the field name itself (e.g. <code className="bg-slate-800 px-1 rounded text-amber-300">CompanyName</code>) — useful for quick test prints without entering real data.</p>

              <H3>Copies</H3>
              <p>Enter the number of copies in the print dialog. The <code className="bg-slate-800 px-1 rounded text-blue-300">^PQ</code> command is injected automatically.</p>
            </Section>

            {/* ── Variables ── */}
            <Section id="variables" title="Template Variables">
              <p>Template variables let you design a label once and fill it with different data at print time — or eventually from a batch data source.</p>

              <H3>Syntax</H3>
              <p>Wrap a field name in double curly braces: <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{CompanyName}}`}</code>. Variables can appear in text elements and barcode data fields.</p>

              <H3>Special behaviour</H3>
              <Table rows={[
                ['{' + '{Price}}',      'Automatically gets a $ prefix when added from the Fields palette'],
                ['{' + '{barcode}}',    'Used by the barcode field buttons — encodes the barcode value'],
              ]} />

              <H3>At print time</H3>
              <p>Every <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{variable}}`}</code> in the label is listed in the print dialog. Enter a value to substitute it, or leave it blank to print the variable name as a placeholder.</p>

              <H3>Canvas preview</H3>
              <p>The canvas always shows the raw <code className="bg-slate-800 px-1 rounded text-amber-300">{`{{variable}}`}</code> syntax. The substitution only happens when ZPL is generated for printing.</p>
            </Section>

            {/* ── Keyboard shortcuts ── */}
            <Section id="keyboard" title="Keyboard Shortcuts">
              <Table rows={[
                ['Delete / Backspace',   'Delete the selected element (when not editing text)'],
                ['Ctrl + Z',             'Undo the last canvas change (up to 30 steps)'],
                ['Ctrl + C / Ctrl + V',  'Copy and paste selected element(s)'],
                ['Double-click text',    'Enter inline text editing mode'],
                ['Escape',               'Exit inline text editing / deselect'],
                ['Click outside canvas', 'Deselect all elements'],
              ]} />
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ id, title, children }) {
  return (
    <div id={`help-${id}`}>
      <h2 className="text-base font-bold text-white mb-3 pb-1.5 border-b border-slate-700">{title}</h2>
      <div className="space-y-2 text-slate-300 leading-relaxed">{children}</div>
    </div>
  );
}

function H3({ children }) {
  return <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-1.5">{children}</h3>;
}

function Hl({ children }) {
  return <span className="text-slate-200 font-medium">{children}</span>;
}

function Kbd({ children }) {
  return <kbd className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs font-mono text-slate-300">{children}</kbd>;
}

function Table({ rows }) {
  return (
    <table className="w-full text-xs mt-1">
      <tbody>
        {rows.map(([key, val], i) => (
          <tr key={i} className="border-b border-slate-800 last:border-0">
            <td className="py-1.5 pr-4 font-mono text-amber-300 whitespace-nowrap align-top w-40">{key}</td>
            <td className="py-1.5 text-slate-400 align-top">{val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
