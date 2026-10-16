import { JUDGEMENTS, RATE_MODS } from './types';

export const calculateNoteSpeed = (bpm, scrollSpeed) => {
  // Convert BPM to milliseconds per beat
  const msPerBeat = 60000 / bpm;
  // Calculate note speed based on scroll speed and BPM
  return msPerBeat * scrollSpeed;
};

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
  const { bpm, patternType, noteCount, duration, speedIncrement, rateMod } = settings;
  // Rate mods actually change the effective BPM now.
  const rate = RATE_MODS[rateMod] ?? 1;
  const baseBpm = bpm * rate;
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
    switch (patternType) {
      case 'streams':
        return msPerBeat / 2; // 1/8 note intervals
      case 'jacks':
        return msPerBeat; // 1/4 note intervals
      case 'jumps':
      case 'chords':
        return msPerBeat * 2; // 1/2 note intervals
      case 'speed':
        return msPerBeat / 2;
      default:
        return msPerBeat;
    }
  };

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
        column = Math.floor(i / 4) % 4;
        break;
      case 'jumps':
        column = i % 2 === 0 ? 0 : 3;
        break;
      case 'chords':
        column = i % 2 === 0 ? [0, 3] : [1, 2];
        break;
      case 'speed':
        column = i % 4;
        break;
      default:
        column = Math.floor(Math.random() * 4);
    }

    notes.push({
      time,
      column,
      type: patternType,
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
