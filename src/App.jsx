import { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Playfield from './components/GamePlayfield';
import { Music, Zap, ArrowRight } from 'lucide-react';

const App = () => {
  const [gameState, setGameState] = useState('dashboard');
  const [settings, setSettings] = useState(null);

  const handleStartGame = (gameSettings) => {
    setSettings(gameSettings);
    setGameState('playing');
  };

  const handleGameEnd = (results) => {
    console.log('Game ended:', results);
    setGameState('dashboard');
  };

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
            <Playfield settings={settings} onGameEnd={handleGameEnd} />
          )}
        </div>
      </div>

      <footer className="footer">
        <p className="text-white">Press D, F, J, K to play</p>
      </footer>
    </div>
  );
};

export default App;