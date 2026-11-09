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
} from './chartEditorLogic.js';

// 140 BPM -> 428.57ms per beat, 107.14ms per row at 4 rows/beat.
const MS_PER_ROW = 60000 / 140 / 4;

const sampleCells = () =>
  new Map([
    [cellKey(0, 0), { kind: 'tap', holdRows: 0 }],
    [cellKey(4, 1), { kind: 'hold', holdRows: 8 }],
    [cellKey(8, 3), { kind: 'tap', holdRows: 0 }],
  ]);

describe('cellsToNotes / notesToCells', () => {
  test('round-trips notes through 1/4-beat rows, hold = 8 rows = 2 beats', () => {
    const notes = cellsToNotes(sampleCells(), MS_PER_ROW);
    expect(notes).toEqual([
      { t: 0, c: 0, h: null },
      { t: Math.round(4 * MS_PER_ROW), c: 1, h: Math.round(8 * MS_PER_ROW) },
      { t: Math.round(8 * MS_PER_ROW), c: 3, h: null },
    ]);
    const { cells, maxRow } = notesToCells(notes, MS_PER_ROW);
    expect(maxRow).toBe(8);
    expect(cells.get(cellKey(4, 1))).toEqual({ kind: 'hold', holdRows: 8 });
    expect(cells.get(cellKey(0, 0))).toEqual({ kind: 'tap', holdRows: 0 });
  });

  test('notesToCells accepts legacy {time,column,hold} notes', () => {
    const { cells } = notesToCells(
      [{ time: 0, column: 2, hold: null }],
      MS_PER_ROW
    );
    expect(cells.get(cellKey(0, 2))).toEqual({ kind: 'tap', holdRows: 0 });
  });

  test('quantizes off-beat times to the nearest 1/4-beat row', () => {
    const { cells } = notesToCells(
      [{ t: Math.round(MS_PER_ROW * 2.6), c: 0, h: null }],
      MS_PER_ROW
    );
    expect([...cells.keys()]).toEqual([cellKey(3, 0)]);
  });
});

describe('mirror / quantize / clear', () => {
  test('mirror maps column c -> 3-c', () => {
    const out = mirrorCells(sampleCells());
    expect([...out.keys()].sort()).toEqual(
      [cellKey(0, 3), cellKey(4, 2), cellKey(8, 0)].sort()
    );
    expect(out.get(cellKey(4, 2))).toEqual({ kind: 'hold', holdRows: 8 });
  });

  test('quantize 4 -> 1 rows/beat snaps off-beat notes to the beat', () => {
    const out = quantizeCells(sampleCells(), 4, 1);
    expect([...out.keys()].sort()).toEqual(
      [cellKey(0, 0), cellKey(1, 1), cellKey(2, 3)].sort()
    );
    expect(out.get(cellKey(1, 1)).holdRows).toBe(2); // 8 rows -> 2 beats
  });

  test('clear lane / clear row only remove their own notes', () => {
    expect(clearLaneCells(sampleCells(), 1).size).toBe(2);
    expect(clearRowCells(sampleCells(), 4).size).toBe(2);
  });
});

describe('copy / paste', () => {
  test('copies a region relative to its top-left and pastes at an anchor', () => {
    const clip = copyRegion(sampleCells(), { r0: 4, c0: 0, r1: 8, c1: 3 });
    expect(clip).toEqual([
      { dr: 0, dc: 1, kind: 'hold', holdRows: 8 },
      { dr: 4, dc: 3, kind: 'tap', holdRows: 0 },
    ]);
    const pasted = pasteCells(new Map(), clip, 20, 0);
    expect(pasted.get(cellKey(20, 1))).toEqual({ kind: 'hold', holdRows: 8 });
    expect(pasted.get(cellKey(24, 3))).toEqual({ kind: 'tap', holdRows: 0 });
  });
});
