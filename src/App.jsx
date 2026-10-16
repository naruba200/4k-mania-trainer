import { useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Playfield from './components/GamePlayfield';
import ResultsScreen from './components/ResultsScreen';
import ReplayViewer from './components/ReplayViewer';
import { Music, Zap } from 'lucide-react';
import { configKey } from './utils';
import {
  getPB,
  trySavePB,
  logRun,
  recordPlayDate,
  getStreak,
  getHistory,
  unlockAchievement,
  ACHIEVEMENT_DEFS,
} from './storage';

// A shared chart arrives as #s=<base64 json> — decode it into dashboard settings.
const parseSharedSettings = () => {
  const hash = window.location.hash;
  if (!hash.startsWith('#s=')) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(hash.slice(3)))));
  } catch {
    return null;
  }
};

const App = () => {
  const [screen, setScreen] = useState('dashboard'); // dashboard | playing | results
  const [settings, setSettings] = useState(null);
  const [results, setResults] = useState(null);
  const [isNewPb, setIsNewPb] = useState(false);
  const [pbDelta, setPbDelta] = useState(0);
  const [newAchievements, setNewAchievements] = useState([]);
  const [replay, setReplay] = useState(null);
  const [runId, setRunId] = useState(0);
  const [sharedSettings] = useState(parseSharedSettings);

  const handleStartGame = (gameSettings) => {
    setSettings(gameSettings);
    setRunId((id) => id + 1);
    setResults(null);
    setReplay(null);
    setScreen('playing');
  };

  const handleGameEnd = (gameResults) => {
    const unlocked = [];
    const grant = (id) => {
      if (unlockAchievement(id)) {
        const def = ACHIEVEMENT_DEFS.find((a) => a.id === id);
        if (def) unlocked.push(def);
      }
    };

    recordPlayDate();
    if (!gameResults.failed) {
      if (gameResults.isFullCombo) grant('first-fc');
      if (gameResults.accuracy >= 95) grant('acc-95');
      if (gameResults.accuracy >= 98) grant('acc-98');
      if (gameResults.score >= 50000) grant('score-50k');
      if (gameResults.score >= 100000) grant('score-100k');
      if (getStreak() >= 7) grant('streak-7');
    }
    if (getHistory().length + 1 >= 10) grant('runs-10');

    // PBs only for generated charts (custom charts have their own identity).
    let newPb = false;
    let delta = 0;
    if (!settings.chartId && !gameResults.failed) {
      const key = configKey(settings);
      const prev = getPB(key);
      delta = gameResults.score - (prev?.score || 0);
      newPb = trySavePB(key, {
        score: gameResults.score,
        accuracy: gameResults.accuracy,
        maxCombo: gameResults.maxCombo,
        date: Date.now(),
      }).isNewBest;
    }

    logRun({
      patternType: settings.chartId ? 'custom' : settings.patternType,
      bpm: settings.bpm,
      score: gameResults.score,
      accuracy: gameResults.accuracy,
      maxCombo: gameResults.maxCombo,
      grade: gameResults.grade,
      date: Date.now(),
    });

    setIsNewPb(newPb);
    setPbDelta(delta);
    setNewAchievements(unlocked);
    setResults(gameResults);
    setScreen('results');
  };

  const handleRetry = () => {
    setRunId((id) => id + 1);
    setResults(null);
    setReplay(null);
    setScreen('playing');
  };

  const handleQuitToDashboard = () => {
    setSettings(null);
    setResults(null);
    setReplay(null);
    setScreen('dashboard');
  };

  return (
    <div className="app">
      <header className="app-header">
        <Music size={28} className="text-mania-2" />
        <h1 className="text-2xl font-bold">4K Mania Trainer</h1>
        <Zap size={28} className="text-mania-2" />
      </header>

      <main className="app-main">
        {screen === 'dashboard' && (
          <Dashboard
            onStartGame={handleStartGame}
            initialSettings={sharedSettings}
          />
        )}

        {screen === 'playing' && settings && (
          <div className="track-stage">
            <Playfield
              key={`${runId}-${JSON.stringify(settings)}`}
              settings={settings}
              onGameEnd={handleGameEnd}
              onRestart={handleRetry}
              onQuit={handleQuitToDashboard}
            />
          </div>
        )}

        {screen === 'results' && results && (
          <ResultsScreen
            results={results}
            settings={settings}
            isNewPb={isNewPb}
            pbDelta={pbDelta}
            newAchievements={newAchievements}
            onRetry={handleRetry}
            onWatchReplay={() => setReplay(results.replay)}
            onQuit={handleQuitToDashboard}
          />
        )}
      </main>

      {replay && (
        <ReplayViewer replay={replay} onClose={() => setReplay(null)} />
      )}
    </div>
  );
};

export default App;
