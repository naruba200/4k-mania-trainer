import { useRef, useEffect, useState, useCallback } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useKeyboardListener } from '../hooks/useKeyboardListener';
import {
  calculateHitJudgement,
  generatePattern,
  calculateAccuracy,
  calculateTimingStats,
  effectiveBpm,
  MAX_HIT_WINDOW,
} from '../utils';
import { JUDGEMENTS } from '../types';
import { Pause, Play, RotateCcw, Home } from 'lucide-react';

// Notes are positioned purely from the music clock:
//   y = receptorY - (note.time - now) * pxPerMs
// so what you see is exactly what the judgement measures. No drift, ever.
const COUNTDOWN_MS = 3000;

const Playfield = ({ settings, onGameEnd, onRestart, onQuit }) => {
  const canvasRef = useRef();
  const { isKeyPressed, consumePresses, pressKey, releaseKey } =
    useKeyboardListener(settings.keyBinds);

  const notesRef = useRef([]);
  const judgementsRef = useRef({});
  const errorsRef = useRef([]); // signed hit errors in ms (negative = early)
  const errSumRef = useRef(0);
  const errCountRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const scoreRef = useRef(0);
  const totalUnitsRef = useRef(0);
  const startTimeRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastJudgementRef = useRef(null);
  const ringsRef = useRef([]); // hit ring effects { at, column }
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const touchMapRef = useRef(new Map());
  const [paused, setPaused] = useState(false);

  // Metronome state
  const audioRef = useRef(null);
  const nextBeatRef = useRef(0);
  const beatCountRef = useRef(0);
  const msPerBeatRef = useRef(500);
  const lastBeatWallRef = useRef(0);

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
      setPausedState(false);
    }
  }, [consumePresses, setPausedState]);

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

  const click = (accent) => {
    const actx = ensureAudio();
    if (!actx) return;
    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.value = accent ? 880 : 660;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  };

  useEffect(() => {
    // Expand chords into per-column notes so every note is judged and drawn
    // individually, then sort by time for the matching/culling loops.
    const instances = [];
    for (const note of generatePattern(settings)) {
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

    notesRef.current = instances;
    judgementsRef.current = {};
    errorsRef.current = [];
    errSumRef.current = 0;
    errCountRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    scoreRef.current = 0;
    totalUnitsRef.current =
      instances.length + instances.filter((n) => n.tail).length;
    lastJudgementRef.current = null;
    ringsRef.current = [];
    gameOverRef.current = false;
    nextBeatRef.current = 0;
    beatCountRef.current = 0;
    msPerBeatRef.current = 60000 / effectiveBpm(settings);
    lastBeatWallRef.current = 0;
    // Countdown: the clock starts negative so notes roll in on "go".
    startTimeRef.current = Date.now() + COUNTDOWN_MS;
    setPausedState(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [settings, setPausedState]);

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
    const { width, height } = canvas;
    const receptorY = height - 50;
    const pxPerMs = 0.5 * settings.scrollSpeed;
    const currentTime = Date.now() - startTimeRef.current;
    const wallNow = Date.now();

    const awardHit = (judgement) => {
      scoreRef.current += JUDGEMENTS[judgement].points;
      comboRef.current += 1;
      maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
      judgementsRef.current[judgement] =
        (judgementsRef.current[judgement] || 0) + 1;
    };

    // --- metronome: steady click at the effective BPM ---
    if (settings.metronome) {
      while (nextBeatRef.current <= currentTime) {
        const b = nextBeatRef.current;
        if (b >= 0) {
          click(beatCountRef.current % 4 === 0);
          lastBeatWallRef.current = wallNow;
        }
        nextBeatRef.current += msPerBeatRef.current;
        beatCountRef.current += 1;
      }
    }

    // --- input: match each discrete keydown to the nearest unhit note ---
    for (const press of consumePresses()) {
      const pressTime = press.time - startTimeRef.current;
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
        awardHit(judgement);
        lastJudgementRef.current = { name: judgement, at: wallNow };
        ringsRef.current.push({ at: wallNow, column: best.column });
      }
    }

    // --- misses: unhit notes past the widest window ---
    for (const note of notesRef.current) {
      if (note.hit === undefined && currentTime - note.time > MAX_HIT_WINDOW) {
        note.hit = false;
        note.hitAt = wallNow;
        judgementsRef.current.MISS = (judgementsRef.current.MISS || 0) + 1;
        comboRef.current = 0;
      }
    }

    // --- hold tails: keep holding or the tail breaks ---
    for (const note of notesRef.current) {
      if (!note.tail || note.hit !== true || note.tailHit !== undefined) continue;
      const held = isKeyPressed(keys[note.column]);
      if (!held) {
        if (currentTime < note.tail - MAX_HIT_WINDOW) {
          // Released too early — tail missed, combo breaks.
          note.tailHit = false;
          note.tailAt = wallNow;
          judgementsRef.current.MISS = (judgementsRef.current.MISS || 0) + 1;
          comboRef.current = 0;
        } else {
          // Released inside the tail window — counts as held through.
          note.tailHit = true;
          note.tailAt = wallNow;
          awardHit(note.judgement);
        }
      } else if (currentTime >= note.tail) {
        // Held all the way through.
        note.tailHit = true;
        note.tailAt = wallNow;
        awardHit(note.judgement);
      }
    }

    // --- game over ---
    if (currentTime >= settings.duration * 1000) {
      gameOverRef.current = true;
      onGameEndRef.current({
        score: scoreRef.current,
        accuracy: calculateAccuracy(judgementsRef.current),
        maxCombo: maxComboRef.current,
        judgements: judgementsRef.current,
        timing: calculateTimingStats(errorsRef.current),
        totalNotes: totalUnitsRef.current,
      });
      return;
    }

    // --- cull notes long past (array stays time-sorted) ---
    while (
      notesRef.current.length > 0 &&
      currentTime - Math.max(notesRef.current[0].time, notesRef.current[0].tail || 0) >
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
        const yTail = receptorY - (note.tail - currentTime) * pxPerMs;
        const yHeadNow =
          note.hit === true
            ? receptorY
            : receptorY - (note.time - currentTime) * pxPerMs;
        const top = Math.min(yHeadNow, yTail);
        const h = Math.abs(yHeadNow - yTail);
        const fading =
          note.tailHit === true && wallNow - note.tailAt > 200;
        if (!fading && top < height + 40 && top + h > -60) {
          let bodyColor = '#cfcfcf';
          if (note.hit === true) {
            if (note.tailHit === false) bodyColor = '#ff6b6b';
            else if (note.tailHit === true)
              bodyColor = JUDGEMENTS[note.judgement]?.color || '#4ecdc4';
            else
              bodyColor = isKeyPressed(keys[note.column])
                ? JUDGEMENTS[note.judgement]?.color || '#4ecdc4'
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
        y = receptorY - (note.time - currentTime) * pxPerMs;
        if (y < -60 || y > height + 40) drawHead = false;
      }
      if (drawHead) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle =
          note.hit === true
            ? JUDGEMENTS[note.judgement]?.color || '#4ecdc4'
            : note.hit === false
              ? '#ff6b6b'
              : '#ffffff';
        ctx.fillRect(x - 25, y - 12, 50, 24);
        ctx.globalAlpha = 1;
      }
    }

    // Hit rings
    ringsRef.current = ringsRef.current.filter(
      (r) => wallNow - r.at < 300
    );
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

    // Receptor line (pulses on the metronome beat)
    const beatAge = wallNow - lastBeatWallRef.current;
    const pulse = settings.metronome && beatAge < 150 ? 1 - beatAge / 150 : 0;
    ctx.strokeStyle = `rgba(140, 140, 220, ${0.45 + pulse * 0.55})`;
    ctx.lineWidth = 2 + pulse * 3;
    ctx.beginPath();
    ctx.moveTo(0, receptorY);
    ctx.lineTo(width, receptorY);
    ctx.stroke();

    // Lane receptors (light up while held)
    for (let i = 0; i < 4; i++) {
      const x = i * columnWidth + columnWidth / 2;
      const pressed = isKeyPressed(keys[i]);
      ctx.fillStyle = pressed ? '#8b8bc7' : '#3a3a4a';
      ctx.strokeStyle = '#8888aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, receptorY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${scoreRef.current}`, 20, 30);
    ctx.fillText(`Combo: ${comboRef.current}`, 20, 58);
    if (errCountRef.current > 0) {
      const avg = errSumRef.current / errCountRef.current;
      ctx.fillStyle = '#aaa';
      ctx.font = '16px monospace';
      ctx.fillText(
        `Avg err: ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}ms`,
        20,
        84
      );
    }

    // Countdown
    if (currentTime < 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(-currentTime / 1000)), width / 2, height / 2);
      ctx.textAlign = 'left';
    }

    // Last judgement popup
    const lj = lastJudgementRef.current;
    if (lj && wallNow - lj.at < 700) {
      const j = JUDGEMENTS[lj.name];
      ctx.fillStyle = j.color;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(j.name.toUpperCase(), width / 2, 90);
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
