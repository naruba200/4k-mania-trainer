export const PATTERN_TYPES = {
  STREAM: 'streams',
  JACKS: 'jacks',
  JUMPS: 'jumps',
  CHORDS: 'chords',
  SPEED: 'speed',
  TRILL: 'trill',
  STAIRCASE: 'staircase',
  CHORDJACKS: 'chordjacks',
  JUMPSTREAM: 'jumpstream',
  HANDSTREAM: 'handstream',
  SPLIT_TRILL: 'splittrill',
  ANCHORS: 'anchors',
  HOLD_STAMINA: 'holdstamina',
};

export const JUDGEMENTS = {
  MARVELOUS: { name: 'Marvelous', color: '#ff6b6b', points: 300, window: 8 },
  PERFECT:  { name: 'Perfect',  color: '#4ecdc4', points: 200, window: 16 },
  GREAT:    { name: 'Great',    color: '#ffe66d', points: 100, window: 32 },
  GOOD:     { name: 'Good',     color: '#6a0572', points: 50,  window: 48 },
  BAD:      { name: 'Bad',      color: '#ff9f43', points: 10,  window: 64 },
  MISS:     { name: 'Miss',     color: '#555',    points: 0,   window: Infinity },
};

export const RATE_MODS = {
  '0.75x': 0.75,
  '1.0x': 1.0,
  '1.25x': 1.25,
  '1.5x': 1.5,
};

export const DEFAULT_KEY_BINDS = ['d', 'f', 'j', 'k'];

// Grade thresholds (accuracy %) — osu!mania style bands.
export const GRADES = [
  { name: 'SS', min: 100, color: '#ffd166' },
  { name: 'S', min: 95, color: '#4ecdc4' },
  { name: 'A', min: 90, color: '#80ed99' },
  { name: 'B', min: 80, color: '#ffe66d' },
  { name: 'C', min: 70, color: '#ff9f43' },
  { name: 'D', min: 0, color: '#ff6b6b' },
];

export const SKINS = {
  default: { name: 'Default' },
  neon: { name: 'Neon' },
  minimal: { name: 'Minimal' },
};

export const SIGNATURES = {
  '4/4': 4,
  '3/4': 3,
};

export const DEFAULT_SETTINGS = {
  bpm: 140,
  rateMod: '1.0x',
  scrollSpeed: 1.0,
  duration: 30,
  noteCount: 100,
  keyBinds: [...DEFAULT_KEY_BINDS],
  patternType: PATTERN_TYPES.STREAM,
  speedIncrement: 5,
  seed: Math.floor(Math.random() * 100000),
  density: 1,
  jackLength: 4,
  holdChance: 0,
  metronome: true,
  signature: '4/4',
  upscroll: false,
  hitsound: true,
  hitsoundVolume: 0.5,
  failMode: false,
  skin: 'default',
  colorblind: false,
  reduceMotion: false,
  // Pattern mixer: array of pattern type strings; empty = single pattern.
  mixer: [],
  // Section practice (seconds into the generated chart); null = full chart.
  sectionStart: null,
  sectionEnd: null,
  loopSection: false,
  // Custom chart id (from storage) — when set, overrides pattern generation.
  chartId: null,
  // Ghost rival: null | 'easy' | 'normal' | 'hard'
  ghost: null,
};