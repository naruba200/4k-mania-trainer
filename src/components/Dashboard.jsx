import { useState } from 'react';
import { PATTERN_TYPES, RATE_MODS, DEFAULT_SETTINGS } from '../types';
import { configKey } from '../utils';
import { loadSettings, saveSettings, getPB, getHistory } from '../storage';
import {
  Play,
  Settings,
  ArrowRight,
  Dices,
  Trophy,
  History,
} from 'lucide-react';

const randomSeed = () => Math.floor(Math.random() * 100000);

const NUMERIC_FIELDS = [
  'bpm',
  'scrollSpeed',
  'duration',
  'noteCount',
  'speedIncrement',
  'seed',
  'density',
  'jackLength',
];

const Dashboard = ({ onStartGame }) => {
  const [settings, setSettings] = useState(() => {
    const saved = loadSettings();
    return { ...DEFAULT_SETTINGS, ...saved, seed: saved?.seed ?? randomSeed() };
  });
  const [history] = useState(() => getHistory());

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : name === 'holdChance'
            ? parseFloat(value) / 100
            : NUMERIC_FIELDS.includes(name)
              ? parseFloat(value)
              : value,
    }));
  };

  const handleKeyBindsChange = (index, value) => {
    const newKeyBinds = [...settings.keyBinds];
    newKeyBinds[index] = value;
    setSettings((prev) => ({ ...prev, keyBinds: newKeyBinds }));
  };

  const handleRerollSeed = () => {
    setSettings((prev) => ({ ...prev, seed: randomSeed() }));
  };

  const handleStart = () => {
    saveSettings(settings);
    onStartGame(settings);
  };

  const pb = getPB(configKey(settings));

  return (
    <div className="dashboard p-4 space-y-4">
      <div className="dashboard-header flex items-center space-x-2">
        <Settings className="text-mania-2" size={24} />
        <h2 className="text-xl font-bold">Practice Settings</h2>
      </div>

      {pb && (
        <div className="pb-panel">
          <Trophy size={16} />
          <span>
            PB — {pb.score.toLocaleString()} · {pb.accuracy.toFixed(1)}%
          </span>
        </div>
      )}

      <div className="settings-grid grid grid-cols-1 gap-4">
        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Pattern Type
          </label>
          <select
            name="patternType"
            value={settings.patternType}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          >
            {Object.entries(PATTERN_TYPES).map(([key, value]) => (
              <option key={key} value={value}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">BPM</label>
          <div className="flex space-x-2">
            <input
              type="range"
              name="bpm"
              min="80"
              max="300"
              value={settings.bpm}
              onChange={handleChange}
              className="w-full"
            />
            <input
              type="number"
              name="bpm"
              min="80"
              max="300"
              value={settings.bpm}
              onChange={handleChange}
              className="w-20 p-2 bg-gray-800 rounded text-white"
            />
          </div>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Rate Mod
          </label>
          <select
            name="rateMod"
            value={settings.rateMod}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          >
            {Object.entries(RATE_MODS).map(([key, value]) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Scroll Speed
          </label>
          <div className="flex space-x-2">
            <input
              type="range"
              name="scrollSpeed"
              min="1"
              max="25"
              step="0.1"
              value={settings.scrollSpeed}
              onChange={handleChange}
              className="w-full"
            />
            <input
              type="number"
              name="scrollSpeed"
              min="1"
              max="25"
              step="0.1"
              value={settings.scrollSpeed}
              onChange={handleChange}
              className="w-20 p-2 bg-gray-800 rounded text-white"
            />
          </div>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Duration (seconds)
          </label>
          <input
            type="number"
            name="duration"
            min="10"
            max="120"
            value={settings.duration}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Note Count
          </label>
          <input
            type="number"
            name="noteCount"
            min="10"
            max="500"
            value={settings.noteCount}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Density
          </label>
          <div className="flex space-x-2 items-center">
            <input
              type="range"
              name="density"
              min="0.5"
              max="2"
              step="0.25"
              value={settings.density}
              onChange={handleChange}
              className="w-full"
            />
            <span className="w-20 p-2 bg-gray-800 rounded text-white text-center">
              {settings.density}x
            </span>
          </div>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Seed
          </label>
          <div className="flex space-x-2">
            <input
              type="number"
              name="seed"
              value={settings.seed}
              onChange={handleChange}
              className="w-full p-2 bg-gray-800 rounded text-white"
            />
            <button
              onClick={handleRerollSeed}
              className="p-2 bg-gray-800 rounded text-white hover:bg-gray-700"
              title="Randomize seed"
            >
              <Dices size={20} />
            </button>
          </div>
        </div>

        {settings.patternType === PATTERN_TYPES.JACKS && (
          <div className="setting-group">
            <label className="block text-sm font-medium mb-1 text-white">
              Jack Length
            </label>
            <input
              type="number"
              name="jackLength"
              min="1"
              max="8"
              value={settings.jackLength}
              onChange={handleChange}
              className="w-full p-2 bg-gray-800 rounded text-white"
            />
          </div>
        )}

        {settings.patternType === PATTERN_TYPES.SPEED && (
          <div className="setting-group">
            <label className="block text-sm font-medium mb-1 text-white">
              Speed Increment (BPM)
            </label>
            <input
              type="number"
              name="speedIncrement"
              min="1"
              max="20"
              value={settings.speedIncrement}
              onChange={handleChange}
              className="w-full p-2 bg-gray-800 rounded text-white"
            />
          </div>
        )}

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Hold Notes
          </label>
          <div className="flex space-x-2 items-center">
            <input
              type="range"
              name="holdChance"
              min="0"
              max="50"
              step="5"
              value={Math.round((settings.holdChance || 0) * 100)}
              onChange={handleChange}
              className="w-full"
            />
            <span className="w-20 p-2 bg-gray-800 rounded text-white text-center">
              {Math.round((settings.holdChance || 0) * 100)}%
            </span>
          </div>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Metronome
          </label>
          <label className="flex items-center space-x-2 p-2 bg-gray-800 rounded text-white cursor-pointer">
            <input
              type="checkbox"
              name="metronome"
              checked={!!settings.metronome}
              onChange={handleChange}
            />
            <span className="text-sm">Click on every beat</span>
          </label>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">
            Key Binds
          </label>
          <div className="grid grid-cols-4 gap-2">
            {settings.keyBinds.map((key, index) => (
              <input
                key={index}
                type="text"
                value={key}
                onChange={(e) => handleKeyBindsChange(index, e.target.value)}
                className="w-full p-2 bg-gray-800 rounded text-center text-white"
                maxLength="1"
              />
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleStart}
        className="w-full bg-mania-2 hover:bg-mania-1 text-white font-bold py-2 px-4 rounded flex items-center justify-center space-x-2"
      >
        <Play size={20} />
        <span>Start Practice</span>
        <ArrowRight size={20} />
      </button>

      {history.length > 0 && (
        <div className="history-panel">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white mb-2">
            <History size={16} /> Recent runs
          </h3>
          <div className="history-list">
            {history.slice(0, 8).map((run, i) => (
              <div key={i} className="history-row">
                <span className="history-pattern">{run.patternType}</span>
                <span className="history-bpm">{run.bpm} BPM</span>
                <span className="history-score">
                  {run.score.toLocaleString()}
                </span>
                <span className="history-acc">{run.accuracy.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
