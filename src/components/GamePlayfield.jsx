import { useRef, useEffect, useState, useCallback } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useKeyboardListener } from '../hooks/useKeyboardListener';
import {
  calculateHitJudgement,
  generatePattern,
  calculateAccuracy,
  calculateTimingStats,
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
  const { isKeyPressed, consumePresses } = useKeyboardListener(settings.keyBinds);

  const notesRef = useRef([]);
  const judgementsRef = useRef({});
  const errorsRef = useRef([]); // signed hit errors in ms (negative = early)
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const scoreRef = useRef(0);
  const totalNotesRef = useRef(0);
  const startTimeRef = useRef(0);
  const gameOverRef = useRef(false);
  const lastJudgementRef = useRef(null);
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const [paused, setPaused] = useState(false);

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

  useEffect(() => {
    // Expand chords into per-column notes so every note is judged and drawn
    // individually, then sort by time for the matching/culling loops.
    const instances = [];
    for (const note of generatePattern(settings)) {
      const cols = Array.isArray(note.column) ? note.column : [note.column];
      for (const column of cols) {
        instances.push({ time: note.time, column, hit: undefined, hitAt: 0 });
      }
    }
    instances.sort((a, b) => a.time - b.time);

    notesRef.current = instances;
    judgementsRef.current = {};
    errorsRef.current = [];
    comboRef.current = 0;
    maxComboRef.current = 0;
    scoreRef.current = 0;
    totalNotesRef.current = instances.length;
    lastJudgementRef.current = null;
    gameOverRef.current = false;
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
        errorsRef.current.push(pressTime - best.time);
        scoreRef.current += JUDGEMENTS[judgement].points;
        comboRef.current += 1;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        judgementsRef.current[judgement] =
          (judgementsRef.current[judgement] || 0) + 1;
        lastJudgementRef.current = { name: judgement, at: wallNow };
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

    // --- game over ---
    if (currentTime >= settings.duration * 1000) {
      gameOverRef.current = true;
      onGameEndRef.current({
        score: scoreRef.current,
        accuracy: calculateAccuracy(judgementsRef.current),
        maxCombo: maxComboRef.current,
        judgements: judgementsRef.current,
        timing: calculateTimingStats(errorsRef.current),
        totalNotes: totalNotesRef.current,
      });
      return;
    }

    // --- cull notes long past (array stays time-sorted) ---
    while (
      notesRef.current.length > 0 &&
      currentTime - notesRef.current[0].time > 1500
    ) {
      notesRef.current.shift();
    }

    // --- draw ---
    ctx.clearRect(0, 0, width, height);
    const columnWidth = width / 4;

    for (const note of notesRef.current) {
      let y;
      let alpha = 1;
      if (note.hit === true) {
        // Hit notes pop at the receptor and fade quickly.
        const age = wallNow - note.hitAt;
        if (age > 150) continue;
        y = receptorY;
        alpha = 1 - age / 150;
      } else {
        y = receptorY - (note.time - currentTime) * pxPerMs;
        if (y < -60 || y > height + 40) continue;
      }
      const x = note.column * columnWidth + columnWidth / 2;
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

    // Receptor line
    ctx.strokeStyle = '#5a5a7a';
    ctx.lineWidth = 2;
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
    <div className="playfield">
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
