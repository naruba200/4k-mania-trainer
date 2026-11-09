import {
  calculateHitJudgement,
  calculateAccuracy,
  generatePattern,
  gradeForAccuracy,
  lastNoteEndSeconds,
  resumeStartTime,
  simulateScore,
  simulateNotes,
  MAX_HIT_WINDOW,
} from './utils.js';
import { JUDGEMENTS } from './types.js';

const base = {
  bpm: 150,
  patternType: 'streams',
  noteCount: 100,
  speedIncrement: 5,
  rateMod: '1.0x',
  density: 1,
  jackLength: 4,
  holdChance: 0,
  seed: 777,
  mixer: [],
  sectionStart: null,
  sectionEnd: null,
};

describe('calculateHitJudgement', () => {
  test('respects judgement windows (Judge 4: 22/45/90/135/180)', () => {
    expect(calculateHitJudgement(10)).toBe('MARVELOUS');
    expect(calculateHitJudgement(30)).toBe('PERFECT');
    expect(calculateHitJudgement(70)).toBe('GREAT');
    expect(calculateHitJudgement(120)).toBe('GOOD');
    expect(calculateHitJudgement(170)).toBe('BAD');
    expect(calculateHitJudgement(200)).toBe('MISS');
    // boundary checks
    expect(calculateHitJudgement(22)).toBe('MARVELOUS');
    expect(calculateHitJudgement(23)).toBe('PERFECT');
    expect(calculateHitJudgement(180)).toBe('BAD');
    expect(calculateHitJudgement(181)).toBe('MISS');
    expect(calculateHitJudgement(MAX_HIT_WINDOW + 1)).toBe('MISS');
  });
});

describe('generatePattern', () => {
  test('is deterministic for the same seed', () => {
    const a = generatePattern(base);
    const b = generatePattern(base);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test('never stacks overlapping holds in one lane', () => {
    for (const patternType of ['streams', 'jacks', 'chords', 'holdstamina']) {
      const notes = generatePattern({
        ...base,
        patternType,
        holdChance: 0.5,
        seed: 7,
      });
      const flat = [];
      for (const n of notes) {
        const cols = Array.isArray(n.column) ? n.column : [n.column];
        for (const c of cols)
          flat.push({ time: n.time, column: c, hold: n.hold });
      }
      flat.sort((a, b) => a.time - b.time);
      const laneEnd = [0, 0, 0, 0];
      for (const n of flat) {
        if (n.hold) {
          expect(n.time).toBeGreaterThanOrEqual(laneEnd[n.column]);
          laneEnd[n.column] = n.time + n.hold;
        }
      }
    }
  });

  test('all pattern types produce valid columns', () => {
    const types = [
      'streams', 'jacks', 'jumps', 'chords', 'speed', 'trill', 'staircase',
      'chordjacks', 'jumpstream', 'handstream', 'splittrill', 'anchors',
      'holdstamina',
    ];
    for (const pt of types) {
      const notes = generatePattern({ ...base, patternType: pt });
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        const cols = Array.isArray(n.column) ? n.column : [n.column];
        for (const c of cols) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(4);
        }
        expect(n.time).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('chordjacks repeat shapes', () => {
    const notes = generatePattern({ ...base, patternType: 'chordjacks' });
    const chordNotes = notes.filter((n) => Array.isArray(n.column));
    expect(chordNotes.length).toBeGreaterThan(0);
  });

  test('staircase stays stepwise', () => {
    const notes = generatePattern({ ...base, patternType: 'staircase' });
    for (let i = 1; i < notes.length; i++) {
      expect(Math.abs(notes[i].column - notes[i - 1].column)).toBeLessThanOrEqual(1);
    }
  });

  test('generates exactly noteCount events (no duration cutoff)', () => {
    expect(generatePattern({ ...base, noteCount: 50 })).toHaveLength(50);
    expect(generatePattern({ ...base, noteCount: 200 })).toHaveLength(200);
    // A huge noteCount is not truncated by any duration.
    expect(generatePattern({ ...base, noteCount: 500 })).toHaveLength(500);
  });

  test('mixer concatenates pattern segments by note count', () => {
    const mixed = generatePattern({
      ...base,
      mixer: ['streams', 'jacks'],
      noteCount: 40,
    });
    const single = generatePattern({ ...base, noteCount: 40 });
    expect(mixed.length).toBeGreaterThanOrEqual(single.length);
    // Second segment starts after the first segment's last note, not at
    // a fixed duration offset: split the run in half by note index and
    // check the second half is strictly later in time.
    const firstHalf = mixed.slice(0, 20);
    const secondHalf = mixed.slice(20);
    const firstEnd = Math.max(...firstHalf.map((n) => n.time + (n.hold || 0)));
    expect(Math.min(...secondHalf.map((n) => n.time))).toBeGreaterThan(firstEnd);
  });

  test('lastNoteEndSeconds is last note end + 3s', () => {
    expect(lastNoteEndSeconds([])).toBe(3);
    expect(lastNoteEndSeconds([{ time: 1000, hold: null }])).toBe(4);
    // Hold tail counts: 2000 + 500 hold = 2500ms -> 5.5s.
    expect(
      lastNoteEndSeconds([
        { time: 1000, hold: null },
        { time: 2000, hold: 500 },
      ])
    ).toBe(5.5);
  });

  test('resumeStartTime restarts the 3s countdown from the frozen time', () => {
    // Frozen at 5000ms, resume at wall 100000: countdown ends at 103000,
    // when currentTime is back to 5000.
    expect(resumeStartTime(100000, 5000)).toBe(103000 - 5000);
    // Paused during the initial countdown: full countdown restart.
    expect(resumeStartTime(100000, -1200)).toBe(103000);
    expect(resumeStartTime(100000, 0)).toBe(103000);
  });
});

describe('gradeForAccuracy', () => {
  test('thresholds (osu!mania style)', () => {
    expect(gradeForAccuracy(100).name).toBe('SS');
    expect(gradeForAccuracy(97).name).toBe('S');
    expect(gradeForAccuracy(92).name).toBe('A');
    expect(gradeForAccuracy(85).name).toBe('B');
    expect(gradeForAccuracy(75).name).toBe('C');
    expect(gradeForAccuracy(40).name).toBe('D');
  });
});

describe('calculateAccuracy', () => {
  test('weights every judgement like osu!mania', () => {
    // All marvelous = 100%
    expect(calculateAccuracy({ MARVELOUS: 10 })).toBe(100);
    // All misses = 0%
    expect(calculateAccuracy({ MISS: 10 })).toBe(0);
    // Half marvelous, half greats: (5*300 + 5*100) / (10*300) = 66.67%
    expect(calculateAccuracy({ MARVELOUS: 5, GREAT: 5 })).toBeCloseTo(
      66.67,
      1
    );
    // Mixed bag stays smooth, never cliff-dives
    const acc = calculateAccuracy({
      MARVELOUS: 80,
      PERFECT: 10,
      GREAT: 5,
      GOOD: 3,
      BAD: 1,
      MISS: 1,
    });
    expect(acc).toBeGreaterThan(85);
    expect(acc).toBeLessThan(100);
    // Empty = fresh run shows 100%
    expect(calculateAccuracy({})).toBe(100);
  });
});

describe('simulateScore / simulateNotes', () => {
  test('is deterministic and sane', () => {
    const a = simulateScore(base, 'normal');
    const b = simulateScore(base, 'normal');
    expect(a).toEqual(b);
    expect(a.total).toBeGreaterThan(0);
    expect(a.score).toBeGreaterThan(0);
    expect(a.accuracy).toBeGreaterThanOrEqual(0);
    expect(a.accuracy).toBeLessThanOrEqual(100);
  });

  test('harder bots score higher', () => {
    const easy = simulateScore(base, 'easy');
    const hard = simulateScore(base, 'hard');
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  test('simulateNotes accepts raw note lists', () => {
    const notes = generatePattern(base).map((n) => ({
      time: n.time,
      column: n.column,
      hold: null,
    }));
    const r = simulateNotes(notes, base, 'normal');
    expect(r.total).toBeGreaterThan(0);
  });
});

describe('JUDGEMENTS', () => {
  test('points sum sanely', () => {
    expect(JUDGEMENTS.MARVELOUS.points).toBe(300);
    expect(JUDGEMENTS.MISS.points).toBe(0);
  });
});
