import { JUDGEMENTS, RATE_MODS } from './types';

export const calculateNoteSpeed = (bpm, scrollSpeed) => {
  // Convert BPM to milliseconds per beat
  const msPerBeat = 60000 / bpm;
  // Calculate note speed based on scroll speed and BPM
  return msPerBeat * scrollSpeed;
};

// Deterministic PRNG so a run can be reproduced from its seed.
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// BPM after the rate mod (before any speed-pattern ramp).
export const effectiveBpm = (settings) => {
  const rate = RATE_MODS[settings.rateMod] ?? 1;
  return settings.bpm * rate;
};

// Stable identity for a training configuration — used for PBs / history.
export const configKey = (s) =>
  [
    s.patternType,
    s.bpm,
    s.rateMod,
    s.density ?? 1,
    s.jackLength ?? 4,
    s.holdChance ?? 0,
    s.seed ?? 0,
  ].join('|');

// Largest finite judgement window (ms). A key press within this range of a
// note's scheduled time counts as a hit; anything later becomes a MISS.
export const MAX_HIT_WINDOW = Math.max(
  ...Object.values(JUDGEMENTS)
    .filter((j) => Number.isFinite(j.window))
    .map((j) => j.window)
);

export const calculateHitJudgement = (hitDelta) => {
  const absDelta = Math.abs(hitDelta);

  for (const [judgement, { window }] of Object.entries(JUDGEMENTS)) {
    if (absDelta <= window) {
      return judgement;
    }
  }

  return 'MISS';
};

export const generatePattern = (settings) => {
  const {
    patternType,
    noteCount,
    duration,
    speedIncrement,
    density = 1,
    jackLength = 4,
    holdChance = 0,
    seed = 0,
  } = settings;
  const rand = mulberry32(seed);
  // Rate mods actually change the effective BPM now.
  const baseBpm = effectiveBpm(settings);
  const notes = [];
  const totalTime = duration * 1000;

  // BPM of note i — ramps from baseBpm up by speedIncrement across the run
  // for the speed pattern, stays flat otherwise.
  const bpmAt = (i) => {
    if (patternType !== 'speed') return baseBpm;
    const progress = noteCount > 1 ? i / (noteCount - 1) : 0;
    return baseBpm + (speedIncrement || 0) * progress;
  };

  const gapAt = (i) => {
    const msPerBeat = 60000 / bpmAt(i);
    let gap;
    switch (patternType) {
      case 'streams':
      case 'speed':
      case 'trill':
      case 'staircase':
        gap = msPerBeat / 2; // 1/8 note intervals
        break;
      case 'jacks':
        gap = msPerBeat; // 1/4 note intervals
        break;
      case 'jumps':
      case 'chords':
        gap = msPerBeat * 2; // 1/2 note intervals
        break;
      default:
        gap = msPerBeat;
    }
    return gap / density;
  };

  const CHORD_SHAPES = [
    [0, 3],
    [1, 2],
    [0, 2],
    [1, 3],
  ];

  // Generate notes based on pattern type
  let time = 0;
  for (let i = 0; i < noteCount; i++) {
    if (time > totalTime) break;

    let column;
    switch (patternType) {
      case 'streams':
        column = i % 4;
        break;
      case 'jacks':
        column = Math.floor(i / jackLength) % 4;
        break;
      case 'jumps':
        column = i % 2 === 0 ? 0 : 3;
        break;
      case 'chords':
        column = CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)];
        break;
      case 'speed':
        column = i % 4;
        break;
      case 'trill':
        column = i % 2; // two-column trill
        break;
      case 'staircase': {
        const p = i % 6;
        column = p < 4 ? p : 6 - p; // 0,1,2,3,2,1
        break;
      }
      default:
        column = Math.floor(rand() * 4);
    }

    // Hold notes: 2 beats long, decided by the seeded RNG.
    const hold =
      holdChance > 0 && rand() < holdChance ? (60000 / bpmAt(i)) * 2 : null;

    notes.push({
      time,
      column,
      type: patternType,
      hold,
    });

    time += gapAt(i);
  }

  return notes;
};

export const calculateScore = (judgements) => {
  // judgements: { JUDGEMENT_NAME: count } — sums points per hit.
  return Object.entries(judgements).reduce(
    (total, [name, count]) => total + (JUDGEMENTS[name]?.points ?? 0) * count,
    0
  );
};

export const calculateAccuracy = (judgements) => {
  const total = Object.values(judgements).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const clean = (judgements.MARVELOUS || 0) + (judgements.PERFECT || 0);
  return (clean / total) * 100;
};

// Timing stats from signed hit errors (ms; negative = early, positive = late).
export const calculateTimingStats = (errors) => {
  const count = errors.length;
  if (count === 0) {
    return { count: 0, mean: 0, sd: 0, meanAbs: 0, early: 0, late: 0 };
  }
  const mean = errors.reduce((a, b) => a + b, 0) / count;
  const sd = Math.sqrt(errors.reduce((a, b) => a + (b - mean) ** 2, 0) / count);
  const meanAbs = errors.reduce((a, b) => a + Math.abs(b), 0) / count;
  const early = errors.filter((e) => e < 0).length;
  const late = errors.filter((e) => e > 0).length;
  return { count, mean, sd, meanAbs, early, late };
};
