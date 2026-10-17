import { parseChartFile } from './chartImport.js';

const SM = `#TITLE:Test Song;
#BPMS:0.000=150.000;
#OFFSET:0;
#NOTES:
     dance-single:
     :
     Challenge:
     10:
     0.9,1,0.9,1,1:
1000
0000
0100
0000
,
0000
0000
0002
0003
;
`;

const OSU = `osu file format v14
[General]
Mode: 3
[Metadata]
Title:Test Mania
[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,1500,128,0,2000:0:0:0:0:
320,192,2000,1,0,0:0:0:0:0:
`;

describe('parseChartFile (.sm)', () => {
  test('parses taps and holds with correct timing', () => {
    const chart = parseChartFile('test.sm', SM);
    expect(chart).not.toBeNull();
    expect(chart.name).toBe('Test Song');
    // 150 BPM -> beat = 400ms. Measure 0 rows at beats 0..3:
    // tap col 0 at beat 0, tap col 1 at beat 2. Measure 1 rows at beats 4..7:
    // hold head col 3 at beat 6 (2400ms), tail at beat 7 (2800ms).
    const taps = chart.notes.filter((n) => !n.hold);
    const holds = chart.notes.filter((n) => n.hold);
    expect(taps).toHaveLength(2);
    expect(taps[0]).toMatchObject({ time: 0, column: 0 });
    expect(taps[1]).toMatchObject({ time: 800, column: 1 });
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ time: 2400, column: 3, hold: 400 });
  });

  test('rejects non-4k charts', () => {
    const sixKey = SM.replace(/^([01234]{4})$/gm, (m) => m + '00');
    expect(parseChartFile('x.sm', sixKey)).toBeNull();
  });

  test('rejects unknown extensions', () => {
    expect(parseChartFile('x.txt', SM)).toBeNull();
  });
});

describe('parseChartFile (.osu)', () => {
  test('parses taps and holds, maps x to columns', () => {
    const chart = parseChartFile('test.osu', OSU);
    expect(chart).not.toBeNull();
    expect(chart.name).toBe('Test Mania');
    expect(chart.notes).toHaveLength(3);
    // x=64 -> col 0, x=192 -> col 1, x=320 -> col 2
    expect(chart.notes[0]).toMatchObject({ time: 1000, column: 0, hold: null });
    expect(chart.notes[1]).toMatchObject({ time: 1500, column: 1, hold: 500 });
    expect(chart.notes[2]).toMatchObject({ time: 2000, column: 2, hold: null });
  });

  test('rejects non-mania mode', () => {
    expect(parseChartFile('x.osu', OSU.replace('Mode: 3', 'Mode: 0'))).toBeNull();
  });
});
