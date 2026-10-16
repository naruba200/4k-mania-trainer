import { useEffect, useRef } from 'react';
import { RotateCcw, Home, Play } from 'lucide-react';
import { judgementColor, simulateScore } from '../utils';

const ORDER = ['MARVELOUS', 'PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS'];

const TimingHistogram = ({ errors, colorblind }) => {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !errors?.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const buckets = new Array(21).fill(0);
    for (const e of errors) {
      const b = Math.max(-10, Math.min(10, Math.round(e / 8)));
      buckets[b + 10]++;
    }
    const max = Math.max(...buckets, 1);
    const bw = W / 21;
    ctx.clearRect(0, 0, W, H);
    buckets.forEach((n, i) => {
      const h = (n / max) * (H - 20);
      ctx.fillStyle = i === 10 ? '#ffffff' : '#4ecdc4';
      ctx.fillRect(i * bw + 1, H - h, bw - 2, h);
    });
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('early ← 0 → late', W / 2, 12);
  }, [errors, colorblind]);
  if (!errors?.length) return null;
  return <canvas ref={ref} width={320} height={110} className="stat-canvas" />;
};

const AccGraph = ({ timeline }) => {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !timeline?.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const step = Math.max(1, Math.floor(timeline.length / 200));
    const pts = timeline.filter((_, i) => i % step === 0);
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t || 1;
    ctx.clearRect(0, 0, W, H);
    // 90/95/98 reference lines
    ctx.strokeStyle = '#33334a';
    ctx.lineWidth = 1;
    for (const refAcc of [90, 95, 98]) {
      const y = H - (refAcc / 100) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = ((p.t - t0) / (t1 - t0)) * W;
      const y = H - (Math.min(100, p.acc) / 100) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [timeline]);
  if (!timeline?.length) return null;
  return <canvas ref={ref} width={320} height={110} className="stat-canvas" />;
};

const ResultsScreen = ({
  results,
  settings,
  isNewPb,
  pbDelta,
  newAchievements = [],
  onRetry,
  onWatchReplay,
  onQuit,
}) => {
  const {
    score,
    accuracy,
    maxCombo,
    judgements,
    timing,
    totalNotes,
    failed,
    loops,
    laneStats,
    grade,
    gradeColor,
    isFullCombo,
  } = results;

  const ghostScore =
    settings.ghost && !settings.chartId
      ? simulateScore(settings, settings.ghost).score
      : null;

  const hitTotal = totalNotes - (judgements.MISS || 0);

  return (
    <div className="results-container">
      <div className="results-panel">
        {failed ? (
          <h2 className="results-failed">FAILED</h2>
        ) : (
          <div className="grade-display" style={{ color: gradeColor }}>
            {grade}
          </div>
        )}
        {isFullCombo && !failed && <div className="fc-badge">FULL COMBO</div>}

        <div className="results-hero">
          <div>
            <div className="results-score">{score.toLocaleString()}</div>
            <div className="results-sub">
              {accuracy.toFixed(2)}% · Max combo {maxCombo}/{totalNotes}
            </div>
          </div>
        </div>

        {isNewPb && !failed && (
          <div className="pb-banner">
            New personal best!
            {pbDelta > 0 && ` (+${pbDelta.toLocaleString()})`}
          </div>
        )}
        {ghostScore != null && (
          <div
            className={`ghost-compare ${score >= ghostScore ? 'won' : 'lost'}`}
          >
            Ghost ({settings.ghost}): {ghostScore.toLocaleString()} —{' '}
            {score >= ghostScore
              ? `you win by ${(score - ghostScore).toLocaleString()}`
              : `${(ghostScore - score).toLocaleString()} behind`}
          </div>
        )}
        {loops > 0 && <div className="loops-note">Section repeated {loops + 1}×</div>}

        {newAchievements.length > 0 && (
          <div className="achievements-unlocked">
            {newAchievements.map((a) => (
              <div key={a.id} className="achievement-toast">
                🏆 {a.name} — {a.desc}
              </div>
            ))}
          </div>
        )}

        <div className="results-sections">
          <div className="results-section">
            <h3>Judgements</h3>
            <div className="judgement-list">
              {ORDER.map((j) => {
                const n = judgements[j] || 0;
                const pct = totalNotes ? ((n / totalNotes) * 100).toFixed(1) : '0.0';
                return (
                  <div key={j} className="judgement-row">
                    <span
                      className="judge-dot"
                      style={{
                        background: judgementColor(j, settings.colorblind),
                      }}
                    />
                    <span className="judge-name">{j}</span>
                    <span className="judge-count">{n}</span>
                    <span className="judge-pct">{pct}%</span>
                  </div>
                );
              })}
            </div>
            <div className="hit-rate">
              Hit rate: {totalNotes ? ((hitTotal / totalNotes) * 100).toFixed(1) : '0.0'}%
              ({hitTotal}/{totalNotes})
            </div>
          </div>

          <div className="results-section">
            <h3>Timing</h3>
            <div className="timing-grid">
              <span>Mean</span>
              <span>
                {timing.mean >= 0 ? '+' : ''}
                {timing.mean.toFixed(1)}ms
              </span>
              <span>Std dev</span>
              <span>{timing.sd.toFixed(1)}ms</span>
              <span>Mean abs</span>
              <span>{timing.meanAbs.toFixed(1)}ms</span>
              <span>Early / late</span>
              <span>
                {timing.early} / {timing.late}
              </span>
            </div>
            <TimingHistogram
              errors={results.errors}
              colorblind={settings.colorblind}
            />
          </div>

          <div className="results-section">
            <h3>Accuracy over time</h3>
            <AccGraph timeline={results.accTimeline} />
          </div>

          <div className="results-section">
            <h3>Per-lane</h3>
            <div className="lane-table">
              {(laneStats || []).map((l, i) => (
                <div key={i} className="lane-row">
                  <span>Lane {i + 1}</span>
                  <span>
                    {l.total
                      ? ((l.hit / l.total) * 100).toFixed(1)
                      : '—'}
                    %
                  </span>
                  <span className="lane-count">
                    {l.hit}/{l.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="results-config">
          {settings.chartId
            ? 'Custom chart'
            : `${settings.patternType} · ${settings.bpm} BPM · seed ${settings.seed}`}
        </div>

        <div className="results-actions">
          <button onClick={onRetry}>
            <RotateCcw size={16} /> Retry
          </button>
          {results.replay && (
            <button onClick={onWatchReplay}>
              <Play size={16} /> Watch replay
            </button>
          )}
          <button onClick={onQuit}>
            <Home size={16} /> Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsScreen;
