export const PATTERN_TYPES = {
  STREAM: 'streams',
  JACKS: 'jacks',
  JUMPS: 'jumps',
  CHORDS: 'chords',
  SPEED: 'speed',
  TRILL: 'trill',
  STAIRCASE: 'staircase',
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
};