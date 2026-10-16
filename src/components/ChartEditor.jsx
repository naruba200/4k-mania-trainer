import { useState } from 'react';
import { X, Play, Save, Download, Upload } from 'lucide-react';

// Simple click-to-place chart editor. Rows are beats; time = row * msPerBeat.
// Click a cell: tap note. Shift+click: 2-beat hold. Click again: remove.
const ChartEditor = ({ onSave, onPlay, onClose }) => {
  const [name, setName] = useState('My chart');
  const [bpm, setBpm] = useState(140);
  const [beats, setBeats] = useState(32);
  const [cells, setCells] = useState(new Map());
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState('');

  const msPerBeat = 60000 / (bpm || 140);

  const toggle = (row, col, hold) => {
    const key = `${row}:${col}`;
    setCells((prev) => {
      const m = new Map(prev);
      if (m.has(key)) m.delete(key);
      else m.set(key, hold ? 'hold' : 'tap');
      return m;
    });
  };

  const toChart = () => {
    const notes = [...cells.entries()]
      .map(([key, kind]) => {
        const [row, col] = key.split(':').map(Number);
        return {
          t: Math.round(row * msPerBeat),
          c: col,
          h: kind === 'hold' ? Math.round(msPerBeat * 2) : null,
        };
      })
      .sort((a, b) => a.t - b.t || a.c - b.c);
    return {
      id: `chart-${Date.now()}`,
      name: name.trim() || 'Untitled chart',
      bpm,
      notes,
      created: Date.now(),
    };
  };

  const noteCount = cells.size;

  const handleSave = () => {
    if (noteCount === 0) {
      setError('Place at least one note first.');
      return;
    }
    setError('');
    onSave(toChart());
  };

  const handlePlay = () => {
    if (noteCount === 0) {
      setError('Place at least one note first.');
      return;
    }
    setError('');
    onPlay(toChart());
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(toChart(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.trim() || 'chart'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    try {
      const chart = JSON.parse(importText);
      if (!Array.isArray(chart.notes)) throw new Error('bad chart');
      const m = new Map();
      const impMsPerBeat = 60000 / (chart.bpm || bpm || 140);
      for (const n of chart.notes) {
        if (typeof n.t !== 'number' || typeof n.c !== 'number') continue;
        if (n.c < 0 || n.c > 3) continue;
        const row = Math.round(n.t / impMsPerBeat);
        m.set(`${row}:${n.c}`, n.h ? 'hold' : 'tap');
      }
      setCells(m);
      setName(chart.name || 'Imported chart');
      if (chart.bpm) setBpm(chart.bpm);
      setImportOpen(false);
      setImportText('');
      setError('');
    } catch {
      setError('Could not parse that chart JSON.');
    }
  };

  const rows = [];
  for (let r = 0; r < beats; r++) {
    const cellsRow = [];
    for (let c = 0; c < 4; c++) {
      const kind = cells.get(`${r}:${c}`);
      cellsRow.push(
        <button
          key={c}
          className={`editor-cell ${kind ? `filled ${kind}` : ''} ${r % 4 === 0 ? 'bar' : ''}`}
          onClick={(e) => toggle(r, c, e.shiftKey)}
          title={`Beat ${r + 1}, lane ${c + 1} (shift-click = hold)`}
        />
      );
    }
    rows.push(
      <div key={r} className="editor-row">
        <span className="editor-beat">{r + 1}</span>
        {cellsRow}
      </div>
    );
  }

  return (
    <div className="editor-overlay">
      <div className="editor-panel">
        <div className="editor-header">
          <h2>Chart Editor</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="editor-controls">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            BPM
            <input
              type="number"
              min={60}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value) || 140)}
            />
          </label>
          <label>
            Beats
            <input
              type="number"
              min={8}
              max={128}
              value={beats}
              onChange={(e) => setBeats(Number(e.target.value) || 32)}
            />
          </label>
          <span className="editor-hint">
            Click = tap · Shift+click = hold · {noteCount} notes
          </span>
        </div>
        {error && <div className="editor-error">{error}</div>}
        <div className="editor-grid">{rows}</div>
        <div className="editor-actions">
          <button onClick={handleSave}>
            <Save size={16} /> Save
          </button>
          <button onClick={handlePlay} className="primary">
            <Play size={16} /> Play
          </button>
          <button onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          <button onClick={() => setImportOpen((v) => !v)}>
            <Upload size={16} /> Import
          </button>
        </div>
        {importOpen && (
          <div className="editor-import">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='Paste chart JSON here…'
              rows={4}
            />
            <button onClick={handleImport}>Load JSON</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartEditor;
