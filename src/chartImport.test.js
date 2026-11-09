import { parseChartFile, parseOszFile } from './chartImport.js';

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

// A 4K .osu with difficulty metadata, as found inside a real .osz.
const OSU_4K = (title, version, objects) => `osu file format v14
[General]
Mode: 3
[Metadata]
Title:${title}
Version:${version}
[Difficulty]
CircleSize:4
[HitObjects]
${objects}
`;

const makeOsz = async (files) => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe('parseChartFile (.sm)', () => {
  test('parses taps and holds with correct timing, in {t,c,h} shape', () => {
    const chart = parseChartFile('test.sm', SM);
    expect(chart).not.toBeNull();
    expect(chart.name).toBe('Test Song');
    // 150 BPM -> beat = 400ms. Measure 0 rows at beats 0..3:
    // tap col 0 at beat 0, tap col 1 at beat 2. Measure 1 rows at beats 4..7:
    // hold head col 3 at beat 6 (2400ms), tail at beat 7 (2800ms).
    const taps = chart.notes.filter((n) => !n.h);
    const holds = chart.notes.filter((n) => n.h);
    expect(taps).toHaveLength(2);
    expect(taps[0]).toMatchObject({ t: 0, c: 0 });
    expect(taps[1]).toMatchObject({ t: 800, c: 1 });
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ t: 2400, c: 3, h: 400 });
    // No legacy {time,column,hold} keys survive.
    for (const n of chart.notes) {
      expect(Object.keys(n).sort()).toEqual(['c', 'h', 't']);
    }
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
  test('parses taps and holds, maps x to columns, in {t,c,h} shape', () => {
    const chart = parseChartFile('test.osu', OSU);
    expect(chart).not.toBeNull();
    expect(chart.name).toBe('Test Mania');
    expect(chart.notes).toHaveLength(3);
    // x=64 -> col 0, x=192 -> col 1, x=320 -> col 2
    expect(chart.notes[0]).toMatchObject({ t: 1000, c: 0, h: null });
    expect(chart.notes[1]).toMatchObject({ t: 1500, c: 1, h: 500 });
    expect(chart.notes[2]).toMatchObject({ t: 2000, c: 2, h: null });
  });

  test('rejects non-mania mode', () => {
    expect(parseChartFile('x.osu', OSU.replace('Mode: 3', 'Mode: 0'))).toBeNull();
  });
});

describe('parseOszFile (.osz)', () => {
  const OBJ = '64,192,1000,1,0,0:0:0:0:\n192,192,1500,1,0,0:0:0:0:';

  test('returns one candidate per 4K difficulty, named Title [Version]', async () => {
    const buf = await makeOsz({
      'song [Easy].osu': OSU_4K('My Song', 'Easy', OBJ),
      'song [Hard].osu': OSU_4K('My Song', 'Hard', OBJ + '\n320,192,2000,1,0,0:0:0:0:'),
      'song.mp3': 'fake-audio-bytes',
      'bg.jpg': 'fake-image-bytes',
    });
    const cands = await parseOszFile(buf);
    expect(cands).toHaveLength(2);
    expect(cands[0].name).toBe('My Song [Easy]');
    expect(cands[0].noteCount).toBe(2);
    expect(cands[1].name).toBe('My Song [Hard]');
    expect(cands[1].noteCount).toBe(3);
    // Notes are the game's internal {t,c,h} shape.
    expect(cands[0].notes[0]).toMatchObject({ t: 1000, c: 0, h: null });
  });

  test('skips non-mania and non-4K difficulties', async () => {
    const std = OSU_4K('My Song', 'Standard', OBJ).replace('Mode: 3', 'Mode: 0');
    const sevenK = OSU_4K('My Song', '7K', OBJ).replace('CircleSize:4', 'CircleSize:7');
    const buf = await makeOsz({
      'a.osu': std,
      'b.osu': sevenK,
      'c.osu': OSU_4K('My Song', '4K', OBJ),
    });
    const cands = await parseOszFile(buf);
    expect(cands).toHaveLength(1);
    expect(cands[0].name).toBe('My Song [4K]');
  });

  test('returns [] when no 4K chart is inside, or the zip is invalid', async () => {
    const buf = await makeOsz({ 'readme.txt': 'hello' });
    expect(await parseOszFile(buf)).toEqual([]);
    expect(await parseOszFile(Buffer.from('not a zip at all'))).toEqual([]);
  });
});
