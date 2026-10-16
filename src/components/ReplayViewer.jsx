import { useRef, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  calculateHitJudgement,
  generatePattern,
  judgementColor,
  MAX_HIT_WINDOW,
} from '../utils';
import { JUDGEMENTS } from '../types';
import { getCharts } from '../storage';

// Replays a recorded run: re-matches the recorded inputs against the chart
// and renders the run back on a canvas, autoplay-style.
const ReplayViewer = ({ replay, onClose }) => {
  const canvasRef = useRef();

  // Pure replay computation — derived during render, not set in an effect.
  const computed = useMemo(() => {
    if (!replay) return null;
    const st = replay.settings;
    let raw;
    if (st.chartId) {
      const chart = getCharts().find((c) => c.id === st.chartId);
      if (!chart) return { missing: true };
      raw = chart.notes.map((n) => ({
        time: n.t,
        column: n.c,
        hold: n.h || null,
      }));
    } else {
      raw = generatePattern(st);
    }

    const keys = (st.keyBinds || ['d', 'f', 'j', 'k']).map((k) =>
      (k || '').toLowerCase()
    );
    const inputs = [...(replay.inputs || [])].sort((a, b) => a.t - b.t);

    // Match presses to notes (same rule as the game).
    const used = new Set();
    const events = [];
    let score = 0;
    const jud = {};
    for (const note of raw) {
      const cols = Array.isArray(note.column) ? note.column : [note.column];
      for (const column of cols) {
        let best = -1;
        let bestDelta = Infinity;
        inputs.forEach((inp, idx) => {
          if (inp.d !== 1 || used.has(idx)) return;
          if (keys.indexOf((inp.k || '').toLowerCase()) !== column) return;
          const delta = Math.abs(inp.t - note.time);
          if (delta < bestDelta) {
            bestDelta = delta;
            best = idx;
          }
        });
        let j = 'MISS';
        if (best >= 0 && bestDelta <= MAX_HIT_WINDOW) {
          used.add(best);
          j = calculateHitJudgement(bestDelta);
          // Tail: nearest release of the same key after the press.
          if (note.hold) {
            const pressKey = (inputs[best].k || '').toLowerCase();
            const rel = inputs.find(
              (inp, idx) =>
                idx > best &&
                inp.d === 0 &&
                (inp.k || '').toLowerCase() === pressKey
            );
            const tailJ = rel
              ? calculateHitJudgement(rel.t - (note.time + note.hold))
              : 'PERFECT';
            events.push({
              t: note.time + note.hold,
              c: column,
              j: tailJ,
              hold: true,
            });
            if (tailJ !== 'MISS') {
              score += JUDGEMENTS[tailJ].points;
              jud[tailJ] = (jud[tailJ] || 0) + 1;
            } else {
              jud.MISS = (jud.MISS || 0) + 1;
            }
          }
        }
        events.push({ t: note.time, c: column, j });
        if (j !== 'MISS') {
          score += JUDGEMENTS[j].points;
          jud[j] = (jud[j] || 0) + 1;
        } else {
          jud.MISS = (jud.MISS || 0) + 1;
        }
      }
    }
    events.sort((a, b) => a.t - b.t);
    const total = events.length;
    const acc =
      total > 0 ? ((jud.MARVELOUS || 0) + (jud.PERFECT || 0)) / total * 100 : 0;
    const lastT = events.length ? events[events.length - 1].t : 0;
    return { missing: false, st, events, score, acc, total, jud, lastT };
  }, [replay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !computed || computed.missing) return;
    const { st, events, lastT } = computed;
    const ctx = canvas.getContext('2d');
    const W = 440;
    const H = 640;
    const RY = H - 50;
    const PX = 0.5 * (st.scrollSpeed || 1);
    const CD = 3000;
    const t0 = performance.now();
    let ptr = 0;
    let raf = 0;
    let lastJ = null;
    const cb = !!st.colorblind;
    const done = { v: false };

    const frame = () => {
      if (done.v) return;
      const now = performance.now() - t0 - CD;
      const wall = performance.now();
      while (ptr < events.length && events[ptr].t <= now) {
        lastJ = { name: events[ptr].j, at: wall };
        ptr++;
      }
      ctx.clearRect(0, 0, W, H);
      const cw = W / 4;
      for (const e of events) {
        const x = e.c * cw + cw / 2;
        if (e.t <= now) {
          const age = now - e.t;
          if (age > 200 || e.j === 'MISS') continue;
          ctx.globalAlpha = 1 - age / 200;
          ctx.fillStyle = judgementColor(e.j, cb);
          ctx.fillRect(x - 25, RY - 12, 50, 24);
          ctx.globalAlpha = 1;
        } else {
          const y = RY - (e.t - now) * PX;
          if (y < -40 || y > H + 40) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 25, y - 12, 50, 24);
        }
      }
      ctx.strokeStyle = '#5a5a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, RY);
      ctx.lineTo(W, RY);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '20px monospace';
      ctx.textAlign = 'left';
      let s = 0;
      for (let i = 0; i < ptr; i++) {
        if (events[i].j !== 'MISS') s += JUDGEMENTS[events[i].j].points;
      }
      ctx.fillText(`Score: ${s}`, 16, 30);
      if (now < 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.ceil(-now / 1000)), W / 2, H / 2);
        ctx.textAlign = 'left';
      }
      if (lastJ && wall - lastJ.at < 700) {
        ctx.fillStyle = judgementColor(lastJ.name, cb);
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(lastJ.name.toUpperCase(), W / 2, 120);
        ctx.textAlign = 'left';
      }
      if (now > lastT + 2000) {
        done.v = true;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      done.v = true;
      cancelAnimationFrame(raf);
    };
  }, [computed]);

  return (
    <div className="replay-overlay">
      <div className="replay-panel">
        <div className="editor-header">
          <h2>Replay</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {!computed || computed.missing ? (
          <p className="replay-missing">
            The custom chart for this replay was deleted.
          </p>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={440}
              height={640}
              className="replay-canvas"
            />
            <div className="replay-summary">
              Score {computed.score.toLocaleString()} ·{' '}
              {computed.acc.toFixed(2)}% · {computed.total} notes
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReplayViewer;
