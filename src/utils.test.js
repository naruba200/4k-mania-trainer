import {
  calculateHitJudgement,
  calculateAccuracy,
  generatePattern,
  gradeForAccuracy,
  effectiveDuration,
  simulateScore,
  simulateNotes,
  MAX_HIT_WINDOW,
} from './utils.js';
import { JUDGEMENTS } from './types.js';

const base = {
  bpm: 150,
  patternType: 'streams',
  noteCount: 100,
  duration: 30,
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
  test('respects judgement windows', () => {
    expect(calculateHitJudgement(5)).toBe('MARVELOUS');
    expect(calculateHitJudgement(12)).toBe('PERFECT');
    expect(calculateHitJudgement(24)).toBe('GREAT');
    expect(calculateHitJudgement(40)).toBe('GOOD');
    expect(calculateHitJudgement(60)).toBe('BAD');
    expect(calculateHitJudgement(65)).toBe('MISS');
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

  test('mixer concatenates pattern segments', () => {
    const mixed = generatePattern({
      ...base,
      mixer: ['streams', 'jacks'],
      duration: 20,
      noteCount: 40,
    });
    const single = generatePattern({ ...base, duration: 20, noteCount: 40 });
    expect(mixed.length).toBeGreaterThanOrEqual(single.length);
    // second half starts after the first segment's duration
    const mid = mixed.filter((n) => n.time >= 10000);
    expect(mid.length).toBeGreaterThan(0);
  });

  test('section trims and shifts notes', () => {
    const notes = generatePattern({
      ...base,
      sectionStart: 5,
      sectionEnd: 10,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.time).toBeLessThan(5000);
    }
    expect(effectiveDuration({ ...base, sectionStart: 5, sectionEnd: 10 })).toBe(5);
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
