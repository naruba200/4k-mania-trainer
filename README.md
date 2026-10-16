# 4K Mania Trainer

A pattern trainer for 4-key vertical rhythm games (osu!mania / Etterna style),
built with **React + Vite + Tailwind CSS** and a canvas playfield. Drill
streams, jacks, jumps, chords, trills and more — with real timing feedback,
not just vibes.

## Features

### Practice
- **Pattern lab** — streams, jacks, jumps, chords, speed ramps, trills,
  staircases, chordjacks, jumpstream, handstream, split trill, anchors, and
  hold-stamina charts
- **Pattern mixer** — chain several pattern types into a single run
- **Section practice** — drill a time range of the chart, with optional
  infinite looping and aggregated stats
- **Seeded patterns** — every run has a seed, so you can replay the exact
  same chart; share it with a friend via a **share link** (URL-encoded settings)
- **Custom chart editor** — click-to-place note grid (shift-click for holds),
  with JSON import/export and a saved chart library

### Feedback
- **Live accuracy counter** — per-note accuracy readout in the HUD,
  color-coded with a live grade preview (SS → D)
- **Full results report** — grade, score, accuracy, max combo, hit rate,
  per-judgement counts and percentages, per-lane accuracy, timing histogram,
  accuracy-over-time graph, and complete timing stats
- **True timing engine** — note positions are a pure function of the music
  clock, so what you see is exactly what gets judged; hold tails are judged
  by your actual release timing
- **Replay system** — every run records its inputs; watch any run back in
  the replay viewer
- **Ghost rival** — race a deterministic bot (easy/normal/hard) live in the
  HUD and on the results screen

### Feel
- **Hitsounds** — per-judgement tap sounds with volume control
- **Upscroll / downscroll**, note skins, colorblind-safe palette,
  reduce-motion mode
- **Metronome** — WebAudio click with 3/4 or 4/4 time signatures and a
  pulsing receptor line; optional background music (your own MP3)
- **Fail mode** — health bar that can actually fail the run

### Progress
- **Skill ratings** — best effective BPM per pattern family at 90%+ accuracy
- **Goals** — set accuracy targets per pattern and watch the progress bars fill
- **Streaks** — daily practice heatmap
- **Achievements** — full combos, accuracy milestones, score clubs, grinder
  badges
- **Presets** — save and reload named setting combos
- **Progress tracking** — settings persist, personal bests are saved per
  configuration, and recent runs are listed on the dashboard

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
