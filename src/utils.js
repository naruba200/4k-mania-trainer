import { JUDGEMENTS, RATE_MODS, GRADES } from './types';

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

// Grade for an accuracy value.
export const gradeForAccuracy = (acc) => {
  for (const g of GRADES) {
    if (acc >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
};

// Colorblind-safe judgement palette (Okabe-Ito inspired).
const CB_COLORS = {
  MARVELOUS: '#d55e00',
  PERFECT: '#009e73',
  GREAT: '#f0e442',
  GOOD: '#0072b2',
  BAD: '#cc79a7',
  MISS: '#999999',
};

export const judgementColor = (name, colorblind = false) =>
  colorblind
    ? CB_COLORS[name] || '#ffffff'
    : JUDGEMENTS[name]?.color || '#ffffff';

// Note/lane colors per skin.
export const skinColors = (skin) =>
  (
    {
      default: {
        note: '#ffffff',
        hold: '#cfcfcf',
        receptor: '#3a3a4a',
        receptorHeld: '#8b8bc7',
      },
      neon: {
        note: '#00f0ff',
        hold: '#0090a8',
        receptor: '#14243e',
        receptorHeld: '#00f0ff',
      },
      minimal: {
        note: '#e8e8e8',
        hold: '#a8a8a8',
        receptor: '#242424',
        receptorHeld: '#777777',
      },
    }
  )[skin] || {
    note: '#ffffff',
    hold: '#cfcfcf',
    receptor: '#3a3a4a',
    receptorHeld: '#8b8bc7',
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
  // Mixer: split the run across several pattern types.
  if (settings.mixer && settings.mixer.length > 0) {
    const segs = settings.mixer;
    const segDur = settings.duration / segs.length;
    const segCount = Math.ceil(settings.noteCount / segs.length);
    let out = [];
    segs.forEach((pt, i) => {
      const sub = genSegment({
        ...settings,
        mixer: [],
        patternType: pt,
        noteCount: segCount,
        duration: segDur,
        seed: (settings.seed ?? 0) + i * 7919,
      });
      const off = i * segDur * 1000;
      out = out.concat(sub.map((n) => ({ ...n, time: n.time + off })));
    });
    return applySection(out, settings);
  }
  return applySection(genSegment(settings), settings);
};

// Keep only the selected section (seconds); shift it to start at 0.
const applySection = (notes, settings) => {
  const { sectionStart, sectionEnd } = settings;
  if (sectionStart == null && sectionEnd == null) return notes;
  const s = (sectionStart ?? 0) * 1000;
  const e = (sectionEnd ?? settings.duration) * 1000;
  return notes
    .filter((n) => n.time >= s && n.time < e)
    .map((n) => ({
      ...n,
      time: n.time - s,
      hold: n.hold ? Math.min(n.hold, Math.max(0, e - n.time)) : n.hold,
    }));
};

// Run length after section trimming.
export const effectiveDuration = (settings) => {
  if (settings.sectionStart != null || settings.sectionEnd != null) {
    return Math.max(
      1,
      (settings.sectionEnd ?? settings.duration) - (settings.sectionStart ?? 0)
    );
  }
  return settings.duration;
};

const genSegment = (settings) => {
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

  // Pattern state for the musical (non-robotic) variations below.
  // Everything runs off the seeded RNG, so a seed always replays the same chart.
  let prevCol = -1;
  let jackCol = Math.floor(rand() * 4);
  let jackPos = 0;
  let jackLen = 1 + Math.floor(rand() * Math.max(1, jackLength));
  const TRILL_PAIRS = [
    [0, 1],
    [1, 2],
    [2, 3],
  ];
  let trillPair = TRILL_PAIRS[Math.floor(rand() * TRILL_PAIRS.length)];
  let stairPos = 0;
  let stairDir = 1;
  // New pattern state
  let cjShape = CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)];
  let cjPos = 0;
  let cjLen = 2 + Math.floor(rand() * 3);
  let anchorCol = Math.floor(rand() * 4);

  // Generate notes based on pattern type
  let time = 0;
  for (let i = 0; i < noteCount; i++) {
    if (time > totalTime) break;

    let column;
    switch (patternType) {
      case 'streams': {
        // Mostly free single notes, with occasional mini-jacks and jumps.
        const r = rand();
        if (r < 0.12 && prevCol >= 0) {
          column = prevCol;
        } else if (r < 0.24) {
          column = CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)];
        } else {
          column = Math.floor(rand() * 4);
        }
        break;
      }
      case 'jacks': {
        // Random jack lengths (1..jackLength) on random columns.
        if (jackPos >= jackLen) {
          jackPos = 0;
          jackCol = Math.floor(rand() * 4);
          jackLen = 1 + Math.floor(rand() * Math.max(1, jackLength));
        }
        column = jackCol;
        jackPos++;
        break;
      }
      case 'jumps':
        column = CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)];
        break;
      case 'chords':
        // Mostly chords, with single-note fills sprinkled in.
        column =
          rand() < 0.75
            ? CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)]
            : Math.floor(rand() * 4);
        break;
      case 'speed': {
        const r = rand();
        column =
          r < 0.1
            ? CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)]
            : i % 4;
        break;
      }
      case 'trill': {
        // Two-finger trill; the pair wanders to neighboring lanes sometimes.
        if (i > 0 && rand() < 0.15) {
          trillPair = TRILL_PAIRS[Math.floor(rand() * TRILL_PAIRS.length)];
        }
        column = trillPair[i % 2];
        break;
      }
      case 'staircase': {
        // Walk up/down the lanes, sometimes turning before the edge.
        if (rand() < 0.18) stairDir *= -1;
        stairPos += stairDir;
        if (stairPos > 3) {
          stairPos = 3;
          stairDir = -1;
        } else if (stairPos < 0) {
          stairPos = 0;
          stairDir = 1;
        }
        column = stairPos;
        break;
      }
      case 'chordjacks': {
        // Jacked 2-note chords: repeat a shape, then switch.
        if (cjPos >= cjLen) {
          cjPos = 0;
          cjShape = CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)];
          cjLen = 2 + Math.floor(rand() * 3);
        }
        column = cjShape;
        cjPos++;
        break;
      }
      case 'jumpstream': {
        // Streams with a jump every 3rd note.
        column =
          i % 3 === 2
            ? CHORD_SHAPES[Math.floor(rand() * CHORD_SHAPES.length)]
            : Math.floor(rand() * 4);
        break;
      }
      case 'handstream': {
        // 8-note blocks alternate between left-hand and right-hand lanes.
        const block = Math.floor(i / 8) % 2;
        column = block === 0 ? i % 2 : 2 + (i % 2);
        break;
      }
      case 'splittrill':
        // Wide two-finger trill across the outer lanes.
        column = i % 2 === 0 ? 0 : 3;
        break;
      case 'anchors': {
        // One lane anchors every 4th note while the rest stream.
        column = i % 4 === 3 ? anchorCol : Math.floor(rand() * 4);
        break;
      }
      case 'holdstamina':
        // Dense streams; holds are forced below.
        column = Math.floor(rand() * 4);
        break;
      default:
        column = Math.floor(rand() * 4);
    }

    prevCol = Array.isArray(column) ? column[column.length - 1] : column;

    // Hold notes: 2 beats normally, 4 beats for hold stamina.
    const hc = patternType === 'holdstamina' ? 0.6 : holdChance;
    const holdBeats = patternType === 'holdstamina' ? 4 : 2;
    const hold =
      hc > 0 && rand() < hc ? (60000 / bpmAt(i)) * holdBeats : null;

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

// Deterministic bot simulation of a chart — powers the ghost rival.
// skill: 'easy' | 'normal' | 'hard' controls the timing error spread.
export const simulateScore = (settings, skill = 'normal') =>
  simulateNotes(generatePattern(settings), settings, skill);

export const simulateNotes = (notes, settings, skill = 'normal') => {
  const P =
    {
      easy: { mean: -15, sd: 30 },
      normal: { mean: -8, sd: 20 },
      hard: { mean: -3, sd: 10 },
    }[skill] || { mean: -8, sd: 20 };

  let h = 0;
  const key = configKey(settings) + '|' + skill;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const rand = mulberry32(h);
  const randn = () => {
    let u = 0,
      v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  let score = 0,
    combo = 0,
    maxCombo = 0,
    judged = 0;
  const jud = {};
  const apply = (j) => {
    judged++;
    if (j === 'MISS') {
      jud.MISS = (jud.MISS || 0) + 1;
      combo = 0;
    } else {
      score += JUDGEMENTS[j].points;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      jud[j] = (jud[j] || 0) + 1;
    }
  };

  for (const n of notes) {
    const ncols = Array.isArray(n.column) ? n.column.length : 1;
    for (let k = 0; k < ncols; k++) {
      const err = P.mean + P.sd * randn();
      let j = 'MISS';
      for (const [name, { window }] of Object.entries(JUDGEMENTS)) {
        if (Math.abs(err) <= window) {
          j = name;
          break;
        }
      }
      apply(j);
      if (n.hold && j !== 'MISS') apply(j); // tail auto-completes like in game
    }
  }

  const acc =
    judged > 0
      ? ((jud.MARVELOUS || 0) + (jud.PERFECT || 0)) / judged * 100
      : 0;
  return { score, accuracy: acc, maxCombo, total: judged, judgements: jud };
};
