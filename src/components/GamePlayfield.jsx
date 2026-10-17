import { useRef, useEffect, useState, useCallback } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useKeyboardListener } from '../hooks/useKeyboardListener';
import {
  calculateHitJudgement,
  generatePattern,
  calculateAccuracy,
  calculateTimingStats,
  effectiveDuration,
  gradeForAccuracy,
  judgementColor,
  skinColors,
  simulateNotes,
  MAX_HIT_WINDOW,
} from '../utils';
import { JUDGEMENTS } from '../types';
import { getCharts } from '../storage';
import { Pause, Play, RotateCcw, Home } from 'lucide-react';

// Notes are positioned purely from the music clock:
//   y = receptorY ∓ (note.time - now) * pxPerMs   (downscroll / upscroll)
// so what you see is exactly what the judgement measures. No drift, ever.
const COUNTDOWN_MS = 3000;

const hitFreq = {
  MARVELOUS: 1320,
  PERFECT: 1174,
  GREAT: 1046,
  GOOD: 880,
  BAD: 740,
};

const Playfield = ({ settings, onGameEnd, onRestart, onQuit }) => {
  const canvasRef = useRef();
  const { isKeyPressed, consumePresses, consumeReleases, pressKey, releaseKey } =
    useKeyboardListener(settings.keyBinds);

  const notesRef = useRef([]);
  const judgementsRef = useRef({});
  const judgedRef = useRef(0);
  const errorsRef = useRef([]); // signed hit errors in ms (negative = early)
  const errSumRef = useRef(0);
  const errCountRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const scoreRef = useRef(0);
  const accRef = useRef(100);
  const healthRef = useRef(100);
  const failedRef = useRef(false);
  const loopsRef = useRef(0);
  const totalUnitsRef = useRef(0);
  const laneRef = useRef([
    { hit: 0, total: 0 },
    { hit: 0, total: 0 },
    { hit: 0, total: 0 },
    { hit: 0, total: 0 },
  ]);
  const accTimelineRef = useRef([]);
  const startTimeRef = useRef(0);
  const durationRef = useRef(30);
  const gameOverRef = useRef(false);
  const lastJudgementRef = useRef(null);
  const ringsRef = useRef([]);
  const ghostRef = useRef(null);
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const touchMapRef = useRef(new Map());
  const replayRef = useRef(null);
  const [paused, setPaused] = useState(false);

  // Shared WebAudio context (hitsounds).
  const audioRef = useRef(null);

  const settingsRef = useRef(settings);
  const onGameEndRef = useRef(onGameEnd);

  // Keep refs fresh without writing them during render.
  useEffect(() => {
    settingsRef.current = settings;
    onGameEndRef.current = onGameEnd;
  });

  const setPausedState = useCallback((p) => {
    pausedRef.current = p;
    setPaused(p);
  }, []);

  const togglePause = useCallback(() => {
    if (gameOverRef.current) return;
    if (!pausedRef.current) {
      pauseStartedAtRef.current = Date.now();
      setPausedState(true);
    } else {
      // Shift the music clock forward by the paused duration so the chart
      // resumes exactly where it froze.
      startTimeRef.current += Date.now() - pauseStartedAtRef.current;
      consumePresses(); // discard presses made while paused
      consumeReleases();
      setPausedState(false);
    }
  }, [consumePresses, consumeReleases, setPausedState]);

  // Esc toggles pause.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause]);

  // Auto-pause when the tab loses focus — otherwise notes unfairly miss.
  useEffect(() => {
    const onBlur = () => {
      if (!gameOverRef.current && !pausedRef.current) togglePause();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [togglePause]);

  const ensureAudio = () => {
    if (!audioRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioRef.current = new AC();
    }
    if (audioRef.current.state === 'suspended') audioRef.current.resume();
    return audioRef.current;
  };

  const click = (accent, freq = null, vol = 0.12, dur = 0.07) => {
    const actx = ensureAudio();
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = freq ? 'triangle' : 'sine';
    osc.frequency.value = freq || (accent ? 880 : 660);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  };

  const hitsound = (judgement) => {
    if (!settingsRef.current.hitsound) return;
    const vol = 0.09 * (settingsRef.current.hitsoundVolume ?? 0.5) * 2;
    click(false, hitFreq[judgement] || 660, Math.min(0.2, vol), 0.05);
  };

  // Build note instances from settings (pattern, mixer, section, or chart).
  const buildNotes = (st) => {
    let raw;
    let duration;
    if (st.chartId) {
      const chart = getCharts().find((c) => c.id === st.chartId);
      raw = (chart?.notes || []).map((n) => ({
        time: n.t,
        column: n.c,
        hold: n.h || null,
        type: 'custom',
      }));
      const maxT = raw.reduce((m, n) => Math.max(m, n.time + (n.hold || 0)), 0);
      duration = maxT / 1000 + 2;
    } else {
      raw = generatePattern(st);
      duration = effectiveDuration(st);
    }
    const instances = [];
    for (const note of raw) {
      const cols = Array.isArray(note.column) ? note.column : [note.column];
      for (const column of cols) {
        instances.push({
          time: note.time,
          column,
          hit: undefined,
          judgement: undefined,
          hitAt: 0,
          tail: note.hold ? note.time + note.hold : null,
          tailHit: undefined,
          tailAt: 0,
        });
      }
    }
    instances.sort((a, b) => a.time - b.time);
    return { instances, duration };
  };

  const resetRunState = (keepStats) => {
    const st = settingsRef.current;
    const { instances, duration } = buildNotes(st);
    notesRef.current = instances;
    durationRef.current = duration;
    if (!keepStats) {
      judgementsRef.current = {};
      judgedRef.current = 0;
      errorsRef.current = [];
      errSumRef.current = 0;
      errCountRef.current = 0;
      comboRef.current = 0;
      maxComboRef.current = 0;
      scoreRef.current = 0;
      accRef.current = 100;
      healthRef.current = 100;
      failedRef.current = false;
      loopsRef.current = 0;
      totalUnitsRef.current = 0;
      laneRef.current = [
        { hit: 0, total: 0 },
        { hit: 0, total: 0 },
        { hit: 0, total: 0 },
        { hit: 0, total: 0 },
      ];
      accTimelineRef.current = [];
      replayRef.current = {
        settings: { ...st },
        inputs: [],
      };
    }
    totalUnitsRef.current +=
      instances.length + instances.filter((n) => n.tail).length;
    lastJudgementRef.current = null;
    ringsRef.current = [];
    gameOverRef.current = false;
    // Countdown: the clock starts negative so notes roll in on "go".
    startTimeRef.current = Date.now() + COUNTDOWN_MS;
    setPausedState(false);
  };

  useEffect(() => {
    const st = settingsRef.current;
    resetRunState(false);
    // Ghost target for this chart (deterministic bot).
    ghostRef.current = st.ghost
      ? simulateNotes(
          notesRef.current.map((n) => ({
            time: n.time,
            column: n.column,
            hold: n.tail ? n.tail - n.time : null,
          })),
          st,
          st.ghost
        ).score
      : null;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, setPausedState]);

  const finishRun = (failed) => {
    gameOverRef.current = true;
    failedRef.current = failed;
    const jud = judgementsRef.current;
    const total = Object.values(jud).reduce((a, b) => a + b, 0);
    const grade = gradeForAccuracy(accRef.current);
    onGameEndRef.current({
      score: scoreRef.current,
      accuracy: accRef.current,
      maxCombo: maxComboRef.current,
      judgements: jud,
      timing: calculateTimingStats(errorsRef.current),
      errors: errorsRef.current,
      totalNotes: totalUnitsRef.current,
      judgedTotal: total,
      failed,
      loops: loopsRef.current,
      laneStats: laneRef.current,
      accTimeline: accTimelineRef.current,
      replay: replayRef.current,
      grade: grade.name,
      gradeColor: grade.color,
      isFullCombo:
        totalUnitsRef.current > 0 && maxComboRef.current >= totalUnitsRef.current,
    });
  };

  // Touch input: each touch maps to a lane column.
  const columnFromTouch = (touch) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    return Math.max(0, Math.min(3, Math.floor((x / rect.width) * 4)));
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    const keys = settingsRef.current.keyBinds.map((k) => (k || '').toLowerCase());
    for (const t of Array.from(e.changedTouches)) {
      const col = columnFromTouch(t);
      touchMapRef.current.set(t.identifier, col);
      pressKey(keys[col]);
    }
  };

  const handleTouchEnd = (e) => {
    const keys = settingsRef.current.keyBinds.map((k) => (k || '').toLowerCase());
    for (const t of Array.from(e.changedTouches)) {
      const col = touchMapRef.current.get(t.identifier);
      if (col !== undefined) {
        releaseKey(keys[col]);
        touchMapRef.current.delete(t.identifier);
      }
    }
  };

  useGameLoop(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameOverRef.current || pausedRef.current) return;
    const ctx = canvas.getContext('2d');
    const settings = settingsRef.current;
    const keys = settings.keyBinds.map((k) => (k || '').toLowerCase());
    const skin = skinColors(settings.skin);
    const cb = !!settings.colorblind;
    const reduceMotion = !!settings.reduceMotion;
    const up = !!settings.upscroll;
    const { width, height } = canvas;
    const receptorY = up ? 50 : height - 50;
    const pxPerMs = 0.5 * settings.scrollSpeed;
    const yFor = (t, now) =>
      up ? receptorY + (t - now) * pxPerMs : receptorY - (t - now) * pxPerMs;
    const currentTime = Date.now() - startTimeRef.current;
    const wallNow = Date.now();
    const failMode = !!settings.failMode;

    const registerJudgement = (j) => {
      judgedRef.current++;
      const jud = judgementsRef.current;
      if (j === 'MISS') {
        jud.MISS = (jud.MISS || 0) + 1;
        comboRef.current = 0;
        if (failMode) healthRef.current = Math.max(0, healthRef.current - 8);
      } else {
        scoreRef.current += JUDGEMENTS[j].points;
        comboRef.current++;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        jud[j] = (jud[j] || 0) + 1;
        if (failMode) {
          const gain =
            { MARVELOUS: 3, PERFECT: 2, GREAT: 1, GOOD: 0, BAD: -4 }[j] ?? 0;
          healthRef.current = Math.min(
            100,
            Math.max(0, healthRef.current + gain)
          );
        }
      }
      accRef.current = calculateAccuracy(jud);
      accTimelineRef.current.push({
        t: Math.round(currentTime),
        acc: Math.round(accRef.current * 100) / 100,
      });
      if (accTimelineRef.current.length > 4000) {
        accTimelineRef.current = accTimelineRef.current.filter(
          (_, i) => i % 2 === 0
        );
      }
      if (failMode && healthRef.current <= 0 && !failedRef.current) {
        finishRun(true);
      }
    };

    // --- input: match each discrete keydown to the nearest unhit note ---
    for (const press of consumePresses()) {
      const pressTime = press.time - startTimeRef.current;
      replayRef.current.inputs.push({
        k: press.key,
        t: Math.round(pressTime),
        d: 1,
      });
      const column = keys.indexOf(press.key);
      if (column === -1) continue;

      let best = null;
      let bestDelta = Infinity;
      for (const note of notesRef.current) {
        if (note.time - pressTime > MAX_HIT_WINDOW) break; // sorted by time
        if (note.hit !== undefined || note.column !== column) continue;
        const delta = Math.abs(pressTime - note.time);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = note;
        }
      }

      if (best && bestDelta <= MAX_HIT_WINDOW) {
        const judgement = calculateHitJudgement(bestDelta);
        best.hit = true;
        best.judgement = judgement;
        best.hitAt = wallNow;
        const err = pressTime - best.time;
        errorsRef.current.push(err);
        errSumRef.current += err;
        errCountRef.current += 1;
        laneRef.current[column].total++;
        laneRef.current[column].hit++;
        registerJudgement(judgement);
        hitsound(judgement);
        lastJudgementRef.current = { name: judgement, at: wallNow };
        if (!reduceMotion)
          ringsRef.current.push({ at: wallNow, column: best.column });
      }
    }

    // --- releases: true tail timing for hold notes ---
    const relMap = new Map();
    for (const rel of consumeReleases()) {
      const relTime = rel.time - startTimeRef.current;
      replayRef.current.inputs.push({
        k: rel.key,
        t: Math.round(relTime),
        d: 0,
      });
      if (!relMap.has(rel.key)) relMap.set(rel.key, relTime);
    }
    if (replayRef.current.inputs.length > 30000) {
      replayRef.current.inputs = replayRef.current.inputs.slice(-30000);
    }

    // --- misses: unhit notes past the widest window ---
    for (const note of notesRef.current) {
      if (note.hit === undefined && currentTime - note.time > MAX_HIT_WINDOW) {
        note.hit = false;
        note.hitAt = wallNow;
        laneRef.current[note.column].total++;
        registerJudgement('MISS');
        if (gameOverRef.current) return; // failed out
      }
    }

    // --- hold tails ---
    for (const note of notesRef.current) {
      if (!note.tail || note.hit !== true || note.tailHit !== undefined)
        continue;
      const key = keys[note.column];
      const relT = relMap.get(key);
      const held = isKeyPressed(key);
      if (relT !== undefined) {
        // Released: judge the release timing against the tail.
        const judgement = calculateHitJudgement(relT - note.tail);
        note.tailHit = judgement !== 'MISS';
        note.tailAt = wallNow;
        registerJudgement(judgement);
        if (note.tailHit) hitsound(judgement);
        if (gameOverRef.current) return;
      } else if (!held) {
        // Key is up with no release on record (e.g. released during pause):
        // treat as an early release.
        note.tailHit = false;
        note.tailAt = wallNow;
        registerJudgement('MISS');
        if (gameOverRef.current) return;
      } else if (currentTime >= note.tail + MAX_HIT_WINDOW) {
        // Held clean through the tail window.
        note.tailHit = true;
        note.tailAt = wallNow;
        registerJudgement('PERFECT');
        hitsound('PERFECT');
      }
    }

    // --- game over ---
    if (gameOverRef.current) return;
    if (currentTime >= durationRef.current * 1000) {
      finishRun(false);
      return;
    }

    // --- cull notes long past (array stays time-sorted) ---
    while (
      notesRef.current.length > 0 &&
      currentTime -
        Math.max(notesRef.current[0].time, notesRef.current[0].tail || 0) >
        1500
    ) {
      notesRef.current.shift();
    }

    // --- draw ---
    ctx.clearRect(0, 0, width, height);
    const columnWidth = width / 4;

    for (const note of notesRef.current) {
      const x = note.column * columnWidth + columnWidth / 2;

      // Hold body
      if (note.tail) {
        const yTail = yFor(note.tail, currentTime);
        const yHeadNow =
          note.hit === true ? receptorY : yFor(note.time, currentTime);
        const top = Math.min(yHeadNow, yTail);
        const h = Math.abs(yHeadNow - yTail);
        const fading = note.tailHit === true && wallNow - note.tailAt > 200;
        if (!fading && top < height + 40 && top + h > -60) {
          let bodyColor = skin.hold;
          if (note.hit === true) {
            if (note.tailHit === false) bodyColor = '#ff6b6b';
            else if (note.tailHit === true)
              bodyColor = judgementColor(note.judgement, cb);
            else
              bodyColor = isKeyPressed(keys[note.column])
                ? judgementColor(note.judgement, cb)
                : '#8888aa';
          } else if (note.hit === false) {
            bodyColor = '#ff6b6b';
          }
          ctx.globalAlpha =
            note.tailHit === true
              ? Math.max(0, 1 - (wallNow - note.tailAt) / 200)
              : 1;
          ctx.fillStyle = bodyColor;
          ctx.fillRect(x - 18, top, 36, h);
          ctx.globalAlpha = 1;
        }
      }

      // Head
      let y;
      let alpha = 1;
      let drawHead = true;
      if (note.hit === true) {
        const age = wallNow - note.hitAt;
        if (age > 150) drawHead = false;
        else {
          y = receptorY;
          alpha = 1 - age / 150;
        }
      } else {
        y = yFor(note.time, currentTime);
        if (y < -60 || y > height + 40) drawHead = false;
      }
      if (drawHead) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle =
          note.hit === true
            ? judgementColor(note.judgement, cb)
            : note.hit === false
              ? '#ff6b6b'
              : skin.note;
        ctx.fillRect(x - 25, y - 12, 50, 24);
        ctx.globalAlpha = 1;
      }
    }

    // Hit rings
    if (!reduceMotion) {
      ringsRef.current = ringsRef.current.filter((r) => wallNow - r.at < 300);
      for (const r of ringsRef.current) {
        const age = wallNow - r.at;
        const x = r.column * columnWidth + columnWidth / 2;
        ctx.globalAlpha = 1 - age / 300;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, receptorY, 14 + age * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Receptor line
    ctx.strokeStyle = 'rgba(140, 140, 220, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, receptorY);
    ctx.lineTo(width, receptorY);
    ctx.stroke();

    // Lane receptors (light up while held)
    for (let i = 0; i < 4; i++) {
      const x = i * columnWidth + columnWidth / 2;
      const pressed = isKeyPressed(keys[i]);
      ctx.fillStyle = pressed ? skin.receptorHeld : skin.receptor;
      ctx.strokeStyle = '#8888aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, receptorY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Health bar (fail mode)
    if (failMode) {
      const bw = Math.min(240, width - 40);
      const bx = (width - bw) / 2;
      const by = up ? height - 24 : 12;
      ctx.fillStyle = '#22222e';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle =
        healthRef.current > 50
          ? '#4ecdc4'
          : healthRef.current > 25
            ? '#ffe66d'
            : '#ff6b6b';
      ctx.fillRect(bx, by, bw * (healthRef.current / 100), 10);
    }

    // HUD
    const grade = gradeForAccuracy(accRef.current);
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${scoreRef.current}`, 20, 30);
    ctx.fillText(`Combo: ${comboRef.current}`, 20, 58);
    ctx.fillStyle = grade.color;
    ctx.fillText(`Acc: ${accRef.current.toFixed(2)}%  [${grade.name}]`, 20, 86);
    if (errCountRef.current > 0) {
      const avg = errSumRef.current / errCountRef.current;
      ctx.fillStyle = '#aaa';
      ctx.font = '16px monospace';
      ctx.fillText(
        `Avg err: ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}ms`,
        20,
        110
      );
    }

    // Ghost rival HUD
    if (ghostRef.current != null && loopsRef.current === 0) {
      const delta = scoreRef.current - ghostRef.current;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#aaa';
      ctx.font = '16px monospace';
      ctx.fillText(
        `Ghost: ${ghostRef.current.toLocaleString()}`,
        width - 20,
        30
      );
      ctx.fillStyle = delta >= 0 ? '#4ecdc4' : '#ff6b6b';
      ctx.fillText(
        `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`,
        width - 20,
        52
      );
      ctx.textAlign = 'left';
    }

    // Countdown
    if (currentTime < 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        String(Math.ceil(-currentTime / 1000)),
        width / 2,
        height / 2
      );
      ctx.textAlign = 'left';
    }

    // Last judgement popup
    const lj = lastJudgementRef.current;
    if (lj && wallNow - lj.at < 700) {
      ctx.fillStyle = judgementColor(lj.name, cb);
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lj.name.toUpperCase(), width / 2, up ? height - 90 : 120);
      ctx.textAlign = 'left';
    }
  }, [settings]);

  return (
    <div
      className="playfield"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <button className="pause-btn" onClick={togglePause} aria-label="Pause">
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      {loopsRef.current > 0 && !paused && (
        <div className="loop-badge">Loop {loopsRef.current + 1}</div>
      )}
      {paused && (
        <div className="pause-overlay">
          <h2 className="text-2xl font-bold mb-4">Paused</h2>
          <div className="pause-buttons">
            <button onClick={togglePause}>
              <Play size={16} /> Resume <span className="key-hint">Esc</span>
            </button>
            <button onClick={onRestart}>
              <RotateCcw size={16} /> Restart
            </button>
            <button onClick={onQuit}>
              <Home size={16} /> Quit to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Playfield;
