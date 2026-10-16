import { useState } from 'react';
import { PATTERN_TYPES, RATE_MODS, DEFAULT_SETTINGS } from '../types';
import { Play, Settings, Music, Zap, ArrowRight } from 'lucide-react';

const Dashboard = ({ onStartGame }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name === 'bpm' || name === 'scrollSpeed' || name === 'duration' || name === 'noteCount' || name === 'speedIncrement'
        ? parseFloat(value)
        : value
    }));
  };

  const handleKeyBindsChange = (index, value) => {
    const newKeyBinds = [...settings.keyBinds];
    newKeyBinds[index] = value;
    setSettings(prev => ({ ...prev, keyBinds: newKeyBinds }));
  };

  const handleStart = () => {
    onStartGame(settings);
  };

  return (
    <div className="dashboard p-4 space-y-4">
      <div className="dashboard-header flex items-center space-x-2">
        <Settings className="text-mania-2" size={24} />
        <h2 className="text-xl font-bold">Practice Settings</h2>
      </div>

      <div className="settings-grid grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">Pattern Type</label>
          <select
            name="patternType"
            value={settings.patternType}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          >
            {Object.entries(PATTERN_TYPES).map(([key, value]) => (
              <option key={key} value={value}>{key}</option>
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
          <label className="block text-sm font-medium mb-1 text-white">Rate Mod</label>
          <select
            name="rateMod"
            value={settings.rateMod}
            onChange={handleChange}
            className="w-full p-2 bg-gray-800 rounded text-white"
          >
            {Object.entries(RATE_MODS).map(([key, value]) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label className="block text-sm font-medium mb-1 text-white">Scroll Speed</label>
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
          <label className="block text-sm font-medium mb-1 text-white">Duration (seconds)</label>
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
          <label className="block text-sm font-medium mb-1 text-white">Note Count</label>
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

        {settings.patternType === PATTERN_TYPES.SPEED && (
          <div className="setting-group">
            <label className="block text-sm font-medium mb-1 text-white">Speed Increment (BPM)</label>
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

        <div className="setting-group col-span-1 md:col-span-2">
          <label className="block text-sm font-medium mb-1 text-white">Key Binds</label>
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
    </div>
  );
};

export default Dashboard;
