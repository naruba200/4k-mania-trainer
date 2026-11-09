// Pure chart-editor logic — no React, so it is unit-testable.
// Cells: Map<"row:col", { kind: 'tap'|'hold', holdRows: number }>
//   row is in subdivision rows (rowsPerBeat rows per beat), holdRows is the
//   hold length in rows (default 8 rows = 2 beats at 4 rows/beat).
// Charts: [{ t (ms), c (0-3), h (hold ms|null) }]. Legacy {time,column,hold}
// notes are accepted on import.

export const cellKey = (row, col) => `${row}:${col}`;

const parseKey = (key) => key.split(':').map(Number);

const normCell = (v) => {
  if (typeof v === 'string') return { kind: v, holdRows: v === 'hold' ? 8 : 0 };
  return { kind: v?.kind || 'tap', holdRows: v?.holdRows || 0 };
};

export const cellsToNotes = (cells, msPerRow) => {
  const notes = [...cells.entries()].map(([key, raw]) => {
    const [row, col] = parseKey(key);
    const cell = normCell(raw);
    return {
      t: Math.round(row * msPerRow),
      c: col,
      h: cell.kind === 'hold' ? Math.round(cell.holdRows * msPerRow) : null,
    };
  });
  notes.sort((a, b) => a.t - b.t || a.c - b.c);
  return notes;
};

export const notesToCells = (notes, msPerRow) => {
  const cells = new Map();
  let maxRow = -1;
  for (const n of notes) {
    const t = typeof n.t === 'number' ? n.t : n.time;
    const c = typeof n.c === 'number' ? n.c : n.column;
    const h = typeof n.h !== 'undefined' ? n.h : n.hold;
    if (typeof t !== 'number' || typeof c !== 'number') continue;
    if (c < 0 || c > 3) continue;
    const row = Math.max(0, Math.round(t / msPerRow));
    const holdRows = h ? Math.max(1, Math.round(h / msPerRow)) : 0;
    cells.set(cellKey(row, c), {
      kind: h ? 'hold' : 'tap',
      holdRows,
    });
    maxRow = Math.max(maxRow, row);
  }
  return { cells, maxRow };
};

export const mirrorCells = (cells) => {
  const out = new Map();
  for (const [key, v] of cells.entries()) {
    const [row, col] = parseKey(key);
    out.set(cellKey(row, 3 - col), normCell(v));
  }
  return out;
};

// Re-quantize when the subdivision changes: scale rows (and hold lengths)
// from oldRowsPerBeat to newRowsPerBeat.
export const quantizeCells = (cells, oldRPB, newRPB) => {
  if (oldRPB === newRPB) return new Map(cells);
  const out = new Map();
  for (const [key, raw] of cells.entries()) {
    const [row, col] = parseKey(key);
    const cell = normCell(raw);
    const newRow = Math.round((row * newRPB) / oldRPB);
    out.set(cellKey(newRow, col), {
      kind: cell.kind,
      holdRows: Math.max(
        cell.kind === 'hold' ? 1 : 0,
        Math.round((cell.holdRows * newRPB) / oldRPB)
      ),
    });
  }
  return out;
};

export const clearLaneCells = (cells, col) => {
  const out = new Map(cells);
  for (const key of [...out.keys()]) {
    if (parseKey(key)[1] === col) out.delete(key);
  }
  return out;
};

export const clearRowCells = (cells, row) => {
  const out = new Map(cells);
  for (const key of [...out.keys()]) {
    if (parseKey(key)[0] === row) out.delete(key);
  }
  return out;
};

// Copy the notes whose head lies inside sel {r0,c0,r1,c1}, relative to the
// selection's top-left corner.
export const copyRegion = (cells, sel) => {
  const r0 = Math.min(sel.r0, sel.r1);
  const c0 = Math.min(sel.c0, sel.c1);
  const r1 = Math.max(sel.r0, sel.r1);
  const c1 = Math.max(sel.c0, sel.c1);
  const out = [];
  for (const [key, raw] of cells.entries()) {
    const [row, col] = parseKey(key);
    if (row < r0 || row > r1 || col < c0 || col > c1) continue;
    const cell = normCell(raw);
    out.push({ dr: row - r0, dc: col - c0, kind: cell.kind, holdRows: cell.holdRows });
  }
  out.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
  return out;
};

// Paste clipboard entries at (anchorRow, anchorCol), overwriting target cells.
export const pasteCells = (cells, clipboard, anchorRow, anchorCol) => {
  const out = new Map(cells);
  for (const item of clipboard) {
    out.set(cellKey(anchorRow + item.dr, anchorCol + item.dc), {
      kind: item.kind,
      holdRows: item.holdRows || 0,
    });
  }
  return out;
};
