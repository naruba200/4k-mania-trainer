# 4K Mania Trainer

A pattern trainer for 4-key vertical rhythm games (osu!mania / Etterna style),
built with **React + Vite + Tailwind CSS** and a canvas playfield. Drill
streams, jacks, jumps, chords, trills and more — with real timing feedback,
not just vibes.

## Features

- **Pattern lab** — streams, jacks, jumps, chords, speed ramps, trills,
  staircases; adjustable BPM (80–300), rate mods, scroll speed, note density,
  jack length, and hold notes
- **Seeded patterns** — every run has a seed, so you can replay the exact
  same chart or share it with a friend
- **True timing engine** — note positions are a pure function of the music
  clock, so what you see is exactly what gets judged
- **Timing feedback** — per-note judgements (Marvelous → Miss), live average
  error in the HUD, and a full timing report (mean error, std deviation,
  early/late split) after every run
- **Hold notes** — 2-beat holds; release early and the tail breaks your combo
- **Metronome** — WebAudio click on every beat (accented downbeat) at the
  effective BPM, with a pulsing receptor line
- **Progress tracking** — settings persist, personal bests are saved per
  configuration, and recent runs are listed on the dashboard
- **Controls** — custom keybinds, pause (Esc), auto-pause on tab blur,
  restart/quit, 3-2-1 countdown, and touch input for mobile

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Other scripts:

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server        |
| `npm run build` | Production build to `dist`  |
| `npm run lint`  | Lint with Oxlint            |
| `npm test`      | Run Jest tests              |

## How it works

- `src/utils.js` — pattern generation (seeded PRNG), judgement windows,
  scoring, accuracy and timing statistics
- `src/storage.js` — localStorage persistence for settings, PBs and history
- `src/components/GamePlayfield.jsx` — canvas game loop: time-based note
  motion, edge-triggered input matching, hold-note logic, metronome
  scheduling, touch handling
- `src/components/Dashboard.jsx` — practice settings, PB display, run history
- `src/components/ResultsScreen.jsx` — post-run report card
- `src/hooks/` — `useGameLoop` (rAF loop) and `useKeyboardListener`
  (discrete keydown queue + held state)

### Judgement windows

| Judgement | Window | Points |
| --------- | ------ | ------ |
| Marvelous | ±8 ms  | 300    |
| Perfect   | ±16 ms | 200    |
| Great     | ±32 ms | 100    |
| Good      | ±48 ms | 50     |
| Bad       | ±64 ms | 10     |
| Miss      | —      | 0      |

## Roadmap

- [ ] Beat-synced background pulse / visual themes
- [ ] Export/import charts as JSON
- [ ] Daily/weekly progress charts
- [ ] Multiplayer race mode
