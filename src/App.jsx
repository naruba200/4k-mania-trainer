import { useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Playfield from './components/GamePlayfield';
import ResultsScreen from './components/ResultsScreen';
import { Music, Zap } from 'lucide-react';
import { configKey } from './utils';
import { trySavePB, logRun } from './storage';

const App = () => {
  const [gameState, setGameState] = useState('dashboard');
  const [settings, setSettings] = useState(null);
  const [results, setResults] = useState(null);
  const [runId, setRunId] = useState(0);

  const handleStartGame = (gameSettings) => {
    setSettings(gameSettings);
    setRunId((id) => id + 1);
    setGameState('playing');
  };

  const handleGameEnd = (runResults) => {
    const key = configKey(settings);
    const { isNewBest, pb } = trySavePB(key, runResults);
    logRun({
      date: Date.now(),
      key,
      patternType: settings.patternType,
      bpm: settings.bpm,
      score: runResults.score,
      accuracy: runResults.accuracy,
      maxCombo: runResults.maxCombo,
    });
    setResults({ ...runResults, key, isNewBest, pb });
    setGameState('results');
  };

  const handleRetry = () => {
    setRunId((id) => id + 1);
    setGameState('playing');
  };

  const handleQuitToDashboard = () => {
    setResults(null);
    setGameState('dashboard');
  };

  const keyLabel = settings
    ? settings.keyBinds.map((k) => (k || '').toUpperCase()).join(' ')
    : 'D F J K';

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="text-2xl font-bold flex items-center justify-center">
          <Music className="mr-2" size={24} />
          4K Mania Trainer
          <Zap className="ml-2" size={24} />
        </h1>
      </header>

      <div className="main-content">
        {gameState === 'dashboard' && (
          <div className="sidebar">
            <Dashboard onStartGame={handleStartGame} />
          </div>
        )}

        <div className="game-container">
          {gameState === 'playing' && (
            <div className="track-stage">
              <Playfield
                key={runId}
                settings={settings}
                onGameEnd={handleGameEnd}
                onRestart={handleRetry}
                onQuit={handleQuitToDashboard}
              />
            </div>
          )}
          {gameState === 'results' && results && (
            <ResultsScreen
              results={results}
              settings={settings}
              onRetry={handleRetry}
              onDashboard={handleQuitToDashboard}
            />
          )}
        </div>
      </div>

      <footer className="footer">
        <p className="text-white">
          {gameState === 'playing'
            ? `Press ${keyLabel} to play · Esc to pause`
            : `Press ${keyLabel} to play`}
        </p>
      </footer>
    </div>
  );
};

export default App;
