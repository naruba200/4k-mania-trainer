import { RotateCcw, Home, Timer } from 'lucide-react';
import { JUDGEMENTS } from '../types';

const ORDER = ['MARVELOUS', 'PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS'];

const ResultsScreen = ({ results, settings, onRetry, onDashboard }) => {
  const { score, accuracy, maxCombo, judgements, timing, totalNotes } = results;

  const meanLabel =
    timing.count === 0 ? (
      '—'
    ) : timing.mean < -0.5 ? (
      `${Math.abs(timing.mean).toFixed(1)} ms early`
    ) : timing.mean > 0.5 ? (
      `${timing.mean.toFixed(1)} ms late`
    ) : (
      'on time'
    );

  const configLine = settings
    ? `${settings.patternType} · ${settings.bpm} BPM${
        settings.rateMod && settings.rateMod !== '1.0x' ? ` @ ${settings.rateMod}` : ''
      } · ${totalNotes} notes · seed ${settings.seed ?? 0}`
    : `${totalNotes} notes`;

  return (
    <div className="results-screen">
      <h2 className="text-2xl font-bold">Run complete</h2>
      {results.isNewBest && (
        <div className="new-best-badge">New personal best!</div>
      )}
      <div className="results-config">{configLine}</div>

      <div className="results-stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{score.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Accuracy</span>
          <span className="stat-value">{accuracy.toFixed(2)}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">Max combo</span>
          <span className="stat-value">
            {maxCombo} / {totalNotes}
          </span>
        </div>
      </div>

      <div className="results-judgements">
        {ORDER.map((name) => (
          <div key={name} className="judgement-row">
            <span
              className="judgement-dot"
              style={{ background: JUDGEMENTS[name].color }}
            />
            <span className="judgement-name">{JUDGEMENTS[name].name}</span>
            <span className="judgement-count">{judgements[name] || 0}</span>
          </div>
        ))}
      </div>

      <div className="results-timing">
        <h3 className="flex items-center gap-2">
          <Timer size={16} /> Timing
        </h3>
        <div className="timing-grid">
          <span>Average error</span>
          <span>{meanLabel}</span>
          <span>Std deviation</span>
          <span>{timing.count ? `${timing.sd.toFixed(1)} ms` : '—'}</span>
          <span>Mean absolute</span>
          <span>{timing.count ? `${timing.meanAbs.toFixed(1)} ms` : '—'}</span>
          <span>Early / late hits</span>
          <span>
            {timing.early} / {timing.late}
          </span>
        </div>
      </div>

      <div className="results-actions">
        <button onClick={onRetry}>
          <RotateCcw size={16} /> Retry
        </button>
        <button onClick={onDashboard}>
          <Home size={16} /> Dashboard
        </button>
      </div>
    </div>
  );
};

export default ResultsScreen;
