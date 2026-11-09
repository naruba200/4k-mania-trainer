import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Play,
  Save,
  Download,
  Upload,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  FlipHorizontal2,
  Trash2,
  Eraser,
} from 'lucide-react';
import NumInput from './NumInput';
import {
  cellsToNotes,
  notesToCells,
  mirrorCells,
  quantizeCells,
  clearLaneCells,
  clearRowCells,
  copyRegion,
  pasteCells,
  cellKey,
} from '../chartEditorLogic.js';

// Chart editor. Grid rows are subdivision rows: rowsPerBeat rows per beat
// (1, 2 or 4 — default 4, i.e. 1/4-beat rows), so time = row * msPerBeat /
// rowsPerBeat. Click a cell: tap note. Shift+click: 2-beat hold. Click
// again: remove. Drag across cells: select a region. Drag a hold's tail:
// resize the hold. Click a row number: select that row.
const DEFAULT_HOLD_BEATS = 2;

const buildInitial = (chart) => {
  if (!chart) {
    return { name: 'My chart', bpm: 140, beats: 32, cells: new Map() };
  }
  const bpm = chart.bpm || 140;
  const msPerRow = 60000 / bpm / 4;
  const { cells, maxRow } = notesToCells(chart.notes || [], msPerRow);
  return {
    name: chart.name || 'My chart',
    bpm,
    beats: Math.max(32, Math.ceil((maxRow + 1) / 4)),
    cells,
  };
};

const ChartEditor = ({ onSave, onPlay, onClose, initialChart }) => {
  const [init] = useState(() => buildInitial(initialChart));
  const [name, setName] = useState(init.name);
  const [bpm, setBpm] = useState(init.bpm);
  const [beats, setBeats] = useState(init.beats);
  const [rowsPerBeat, setRowsPerBeat] = useState(4);
  const [cells, setCells] = useState(init.cells);
  const [hist, setHist] = useState({ stack: [init.cells], index: 0 });
  const [selection, setSelection] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState('');
  const dragRef = useRef(null); // { mode, startRow, startCol, headRow, col, preCells, moved }
  const clipboardRef = useRef(null);

  const msPerRow = 60000 / (bpm || 140) / rowsPerBeat;
  const totalRows = beats * rowsPerBeat;

  // --- history ---
  const pushHistory = useCallback((nextCells) => {
    setCells(nextCells);
    setHist((h) => {
      const stack = h.stack.slice(0, h.index + 1);
      stack.push(nextCells);
      if (stack.length > 50) stack.shift();
      return { stack, index: stack.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.index <= 0) return h;
      const next = { ...h, index: h.index - 1 };
      setCells(h.stack[next.index]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (h.index >= h.stack.length - 1) return h;
      const next = { ...h, index: h.index + 1 };
      setCells(h.stack[next.index]);
      return next;
    });
  }, []);

  const canUndo = hist.index > 0;
  const canRedo = hist.index < hist.stack.length - 1;

  const toChart = () => ({
    id: initialChart?.id || `chart-${Date.now()}`,
    name: name.trim() || 'Untitled chart',
    bpm,
    notes: cellsToNotes(cells, msPerRow),
    created: initialChart?.created || Date.now(),
  });

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
      const impBpm = chart.bpm || bpm || 140;
      const impMsPerRow = 60000 / impBpm / rowsPerBeat;
      const { cells: m, maxRow } = notesToCells(chart.notes, impMsPerRow);
      pushHistory(m);
      setName(chart.name || 'Imported chart');
      if (chart.bpm) setBpm(chart.bpm);
      if (maxRow >= 0) {
        setBeats((b) => Math.max(b, Math.ceil((maxRow + 1) / rowsPerBeat)));
      }
      setSelection(null);
      setImportOpen(false);
      setImportText('');
      setError('');
    } catch {
      setError('Could not parse that chart JSON.');
    }
  };

  // --- grid helpers ---
  const holdAt = (row, col) => {
    for (const [key, v] of cells.entries()) {
      const [hr, hc] = key.split(':').map(Number);
      if (hc !== col || v.kind !== 'hold') continue;
      if (row > hr && row < hr + v.holdRows) return { headRow: hr, cell: v };
    }
    return null;
  };

  const toggleCell = (row, col, hold) => {
    const key = cellKey(row, col);
    const next = new Map(cells);
    if (next.has(key)) next.delete(key);
    else
      next.set(key, {
        kind: hold ? 'hold' : 'tap',
        holdRows: hold ? DEFAULT_HOLD_BEATS * rowsPerBeat : 0,
      });
    pushHistory(next);
  };

  // --- mouse: click / drag-select / hold-resize ---
  const onCellMouseDown = (e, row, col) => {
    if (e.button !== 0) return;
    const tail = holdAt(row, col);
    dragRef.current = {
      mode: tail ? 'resize' : 'pending',
      startRow: row,
      startCol: col,
      headRow: tail ? tail.headRow : row,
      col,
      moved: false,
      shiftKey: e.shiftKey,
    };
    if (!tail) setSelection(null);
  };

  const onCellMouseEnter = (row, col) => {
    // dragRef only exists between mousedown and mouseup, so entering a
    // cell with it set means the mouse button is held down.
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pending' && (row !== d.startRow || col !== d.startCol)) {
      d.mode = 'select';
      d.moved = true;
      setSelection({ r0: d.startRow, c0: d.startCol, r1: row, c1: col });
    } else if (d.mode === 'select') {
      d.moved = true;
      setSelection({ r0: d.startRow, c0: d.startCol, r1: row, c1: col });
    } else if (d.mode === 'resize') {
      const newLen = Math.max(1, Math.min(row - d.headRow + 1, totalRows - d.headRow));
      const curHead = cells.get(cellKey(d.headRow, d.col));
      if (curHead && newLen !== curHead.holdRows) {
        d.moved = true;
        const next = new Map(cells);
        next.set(cellKey(d.headRow, d.col), { ...curHead, holdRows: newLen });
        setCells(next);
      }
    }
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.mode === 'pending') {
      // Plain click: place / remove (unless it was a hold tail).
      if (!holdAt(d.startRow, d.startCol)) {
        toggleCell(d.startRow, d.startCol, d.shiftKey);
      }
    } else if (d.mode === 'resize' && d.moved) {
      pushHistory(cells);
    }
    // 'select' keeps its selection.
  };

  // Mouse-up anywhere finalizes a drag (pointer may leave the grid).
  useEffect(() => {
    const up = () => {
      if (dragRef.current) endDrag();
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  // --- copy / paste ---
  const copySelection = useCallback(() => {
    if (!selection) return;
    const clip = copyRegion(cells, selection);
    if (clip.length === 0) return;
    clipboardRef.current = clip;
    setClipboard(clip);
  }, [cells, selection]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.length === 0) return;
    const anchorRow = selection ? Math.min(selection.r0, selection.r1) : 0;
    const anchorCol = selection ? Math.min(selection.c0, selection.c1) : 0;
    pushHistory(pasteCells(cells, clip, anchorRow, anchorCol));
  }, [cells, selection, pushHistory]);

  // Keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo-redo, Ctrl+C / Ctrl+V.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'c') {
        e.preventDefault();
        copySelection();
      } else if (k === 'v') {
        e.preventDefault();
        pasteClipboard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copySelection, pasteClipboard]);

  // --- toolbar actions ---
  const clearAll = () => {
    if (cells.size === 0) return;
    pushHistory(new Map());
    setSelection(null);
  };

  const clearLane = (col) => {
    pushHistory(clearLaneCells(cells, col));
  };

  const clearSelected = () => {
    if (!selection) return;
    const r0 = Math.min(selection.r0, selection.r1);
    const r1 = Math.max(selection.r0, selection.r1);
    let next = new Map(cells);
    for (let r = r0; r <= r1; r++) next = clearRowCells(next, r);
    pushHistory(next);
    setSelection(null);
  };

  const mirror = () => {
    if (cells.size === 0) return;
    pushHistory(mirrorCells(cells));
  };

  const changeSubdiv = (newRPB) => {
    if (newRPB === rowsPerBeat) return;
    pushHistory(quantizeCells(cells, rowsPerBeat, newRPB));
    setRowsPerBeat(newRPB);
  };

  const inSelection = (row, col) => {
    if (!selection) return false;
    const r0 = Math.min(selection.r0, selection.r1);
    const r1 = Math.max(selection.r0, selection.r1);
    const c0 = Math.min(selection.c0, selection.c1);
    const c1 = Math.max(selection.c0, selection.c1);
    return row >= r0 && row <= r1 && col >= c0 && col <= c1;
  };

  // --- render grid ---
  const rows = [];
  for (let r = 0; r < totalRows; r++) {
    const cellsRow = [];
    for (let c = 0; c < 4; c++) {
      const head = cells.get(cellKey(r, c));
      const tail = !head ? holdAt(r, c) : null;
      const kind = head?.kind || (tail ? 'hold' : null);
      cellsRow.push(
        <button
          key={c}
          type="button"
          className={`editor-cell ${kind ? `filled ${kind}` : ''} ${tail ? 'hold-tail' : ''} ${r % (rowsPerBeat * 4) === 0 ? 'bar' : ''} ${inSelection(r, c) ? 'selected' : ''}`}
          onMouseDown={(e) => onCellMouseDown(e, r, c)}
          onMouseEnter={() => onCellMouseEnter(r, c)}
          title={
            head
              ? `Row ${r + 1}, lane ${c + 1} (${head.kind}${head.kind === 'hold' ? `, ${head.holdRows} rows — drag tail to resize` : ''})`
              : `Row ${r + 1}, lane ${c + 1} (shift-click = hold, drag = select)`
          }
        />
      );
    }
    rows.push(
      <div key={r} className="editor-row">
        <button
          type="button"
          className="editor-beat"
          onClick={() => setSelection({ r0: r, c0: 0, r1: r, c1: 3 })}
          title="Select this row"
        >
          {r % rowsPerBeat === 0 ? Math.floor(r / rowsPerBeat) + 1 : ''}
        </button>
        {cellsRow}
      </div>
    );
  }

  return (
    <div className="editor-overlay">
      <div className="editor-panel">
        <div className="editor-header">
          <h2>{initialChart ? `Edit chart — ${initialChart.name}` : 'Chart Editor'}</h2>
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
            <NumInput
              name="bpm"
              value={bpm}
              defaultValue={140}
              min={60}
              max={300}
              onCommit={(_n, v) => setBpm(v)}
              className="editor-num-input"
            />
          </label>
          <label>
            Beats
            <NumInput
              name="beats"
              value={beats}
              defaultValue={32}
              min={8}
              max={128}
              onCommit={(_n, v) => setBeats(v)}
              className="editor-num-input"
            />
          </label>
          <label>
            Snap
            <span className="snap-group">
              {[1, 2, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`snap-btn ${rowsPerBeat === n ? 'active' : ''}`}
                  onClick={() => changeSubdiv(n)}
                >
                  {n === 1 ? '1' : `1/${n}`}
                </button>
              ))}
            </span>
          </label>
          <span className="editor-hint">
            Click = tap · Shift+click = hold · Drag = select · Drag a hold tail
            to resize · {noteCount} notes · {rowsPerBeat === 1 ? '1' : `1/${rowsPerBeat}`}-beat rows
          </span>
        </div>
        {error && <div className="editor-error">{error}</div>}
        <div className="editor-tools">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={16} /> Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={16} /> Redo
          </button>
          <button
            type="button"
            onClick={copySelection}
            disabled={!selection}
            title="Copy selection (Ctrl+C)"
          >
            <Copy size={16} /> Copy
          </button>
          <button
            type="button"
            onClick={pasteClipboard}
            disabled={!clipboard}
            title="Paste at selection / row 1 (Ctrl+V)"
          >
            <ClipboardPaste size={16} /> Paste
          </button>
          <button type="button" onClick={mirror} title="Mirror left-right">
            <FlipHorizontal2 size={16} /> Mirror
          </button>
          <button
            type="button"
            onClick={clearSelected}
            disabled={!selection}
            title="Clear the selected row(s)"
          >
            <Eraser size={16} /> Clear selected
          </button>
          <button type="button" onClick={clearAll} title="Clear the whole chart">
            <Trash2 size={16} /> Clear all
          </button>
        </div>
        <div className="editor-lane-clear">
          <span className="editor-beat" />
          {[0, 1, 2, 3].map((c) => (
            <button
              key={c}
              type="button"
              className="lane-clear-btn"
              onClick={() => clearLane(c)}
              title={`Clear lane ${c + 1}`}
            >
              ✕ lane {c + 1}
            </button>
          ))}
        </div>
        <div className="editor-grid">{rows}</div>
        <div className="editor-actions">
          <button type="button" onClick={handleSave}>
            <Save size={16} /> Save
          </button>
          <button type="button" onClick={handlePlay} className="primary">
            <Play size={16} /> Play
          </button>
          <button type="button" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          <button type="button" onClick={() => setImportOpen((v) => !v)}>
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
            <button type="button" onClick={handleImport}>Load JSON</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartEditor;
