import { useState } from 'react';
import {
  Settings,
  Play,
  ArrowRight,
  Dices,
  Trophy,
  History,
  Link2,
  Save,
  Trash2,
  Target,
  Flame,
  Award,
  Music,
} from 'lucide-react';
import { PATTERN_TYPES, RATE_MODS, DEFAULT_SETTINGS, SKINS } from '../types';
import {
  loadSettings,
  saveSettings,
  getPB,
  getHistory,
  getCharts,
  saveChart,
  deleteChart,
  getPresets,
  savePreset,
  deletePreset,
  getGoals,
  saveGoal,
  deleteGoal,
  getAchievements,
  ACHIEVEMENT_DEFS,
  getStreak,
  getRecentDays,
  computeRatings,
  getBestAcc,
} from '../storage';
import { configKey } from '../utils';
import ChartEditor from './ChartEditor';

const randomSeed = () => Math.floor(Math.random() * 100000);

const NUMERIC_FIELDS = [
  'bpm',
  'scrollSpeed',
  'duration',
  'noteCount',
  'seed',
  'density',
  'jackLength',
  'speedIncrement',
  'hitsoundVolume',
];

const Dashboard = ({ onStartGame, initialSettings }) => {
  const [settings, setSettings] = useState(() => {
    const saved = loadSettings();
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      ...(initialSettings || {}),
      seed: initialSettings?.seed ?? saved?.seed ?? randomSeed(),
    };
  });
  const [history] = useState(() => getHistory());
  const [charts, setCharts] = useState(() => getCharts());
  const [presets, setPresets] = useState(() => getPresets());
  const [goals, setGoals] = useState(() => getGoals());
  const [achievements] = useState(() => getAchievements());
  const [ratings] = useState(() => computeRatings());
  const [streak] = useState(() => getStreak());
  const [recentDays] = useState(() => getRecentDays(14));
  const [showEditor, setShowEditor] = useState(false);
  const [chartTab, setChartTab] = useState(false);
  const [notice, setNotice] = useState('');
  const [presetName, setPresetName] = useState('');
  const [goalPattern, setGoalPattern] = useState(PATTERN_TYPES.STREAM);
  const [goalAcc, setGoalAcc] = useState(95);
  const [shared, setShared] = useState(false);
  const [musicName, setMusicName] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => {
      let next;
      if (type === 'checkbox') {
        next = checked;
      } else if (name === 'holdChance') {
        const n = parseFloat(value) / 100;
        // Clearing the field yields NaN — keep the previous value instead of
        // poisoning the run (NaN duration = game never ends).
        next = Number.isFinite(n) ? n : prev[name];
      } else if (name === 'sectionStart' || name === 'sectionEnd') {
        if (value === '') {
          next = null;
        } else {
          const n = parseFloat(value);
          next = Number.isFinite(n) ? n : prev[name];
        }
      } else if (NUMERIC_FIELDS.includes(name)) {
        const n = parseFloat(value);
        next = Number.isFinite(n) ? n : prev[name];
      } else {
        next = value;
      }
      return { ...prev, [name]: next };
    });
  };

  const handleKeyBindsChange = (index, value) => {
    const newKeyBinds = [...settings.keyBinds];
    newKeyBinds[index] = value;
    setSettings((prev) => ({ ...prev, keyBinds: newKeyBinds }));
  };

  const handleRerollSeed = () => {
    setSettings((prev) => ({ ...prev, seed: randomSeed() }));
  };

  const toggleMixer = (pt) => {
    setSettings((prev) => {
      const mixer = prev.mixer || [];
      return {
        ...prev,
        mixer: mixer.includes(pt)
          ? mixer.filter((m) => m !== pt)
          : [...mixer, pt],
      };
    });
  };

  const handleMusicFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSettings((prev) => ({
      ...prev,
      bgMusicUrl: URL.createObjectURL(f),
    }));
    setMusicName(f.name);
  };

  const stripTransient = (s) => {
    const copy = { ...s };
    delete copy.bgMusicUrl;
    return copy;
  };

  const handleStart = () => {
    const safe = {
      ...settings,
      duration: Math.max(5, Number.isFinite(settings.duration) ? settings.duration : 30),
      noteCount: Math.max(1, Math.round(Number.isFinite(settings.noteCount) ? settings.noteCount : 100)),
      bpm: Math.min(300, Math.max(60, Number.isFinite(settings.bpm) ? settings.bpm : 140)),
    };
    if (chartTab) {
      if (charts.length === 0) {
        setNotice('No custom charts yet — open the editor to make one.');
        return;
      }
      if (!charts.some((c) => c.id === safe.chartId)) {
        safe.chartId = charts[0].id; // auto-select the first chart
        setSettings((p) => ({ ...p, chartId: charts[0].id }));
      }
    }
    setNotice('');
    const out = { ...safe, chartId: chartTab ? safe.chartId : null };
    saveSettings(stripTransient(out));
    onStartGame(out);
  };

  const handleShare = async () => {
    const data = btoa(
      unescape(encodeURIComponent(JSON.stringify(stripTransient(settings))))
    );
    const url = `${window.location.origin}${window.location.pathname}#s=${data}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      window.prompt('Copy your share link:', url);
    }
  };

  // --- presets ---
  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset = { name, settings: stripTransient(settings) };
    savePreset(preset);
    setPresets(getPresets());
    setPresetName('');
  };
  const handleLoadPreset = (p) => {
    setSettings((prev) => ({ ...prev, ...p.settings }));
  };

  // --- goals ---
  const handleAddGoal = () => {
    saveGoal({
      id: `goal-${Date.now()}`,
      patternType: goalPattern,
      targetAcc: goalAcc,
    });
    setGoals(getGoals());
  };

  // --- charts ---
  const handleSaveChart = (chart) => {
    saveChart(chart);
    setCharts(getCharts());
    setShowEditor(false);
  };
  const handlePlayChart = (chart) => {
    saveChart(chart);
    const list = getCharts();
    setCharts(list);
    setShowEditor(false);
    setChartTab(true);
    const s = { ...stripTransient(settings), chartId: chart.id };
    saveSettings(s);
    onStartGame({ ...s, bgMusicUrl: settings.bgMusicUrl });
  };
  const handleDeleteChart = (id) => {
    deleteChart(id);
    setCharts(getCharts());
    if (settings.chartId === id) {
      setSettings((prev) => ({ ...prev, chartId: null }));
    }
  };

  const pb = chartTab ? null : getPB(configKey(settings));
  const usingChart = chartTab;
  const activeChart = charts.find((c) => c.id === settings.chartId);

  const selectCls = 'w-full p-2 bg-gray-800 rounded text-white';
  const labelCls = 'block text-sm font-medium mb-1 text-white';

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

      {/* ---- chart source ---- */}
      <div className="setting-group">
        <label className={labelCls}>Chart Source</label>
        <div className="flex space-x-2">
          <button
            className={`source-tab ${!usingChart ? 'active' : ''}`}
            onClick={() => {
              setChartTab(false);
              setSettings((p) => ({ ...p, chartId: null }));
            }}
          >
            Pattern generator
          </button>
          <button
            className={`source-tab ${usingChart ? 'active' : ''}`}
            onClick={() => {
              setChartTab(true);
              if (charts[0] && !settings.chartId) {
                setSettings((p) => ({ ...p, chartId: charts[0].id }));
              }
            }}
          >
            Custom chart
          </button>
          <button className="source-tab" onClick={() => setShowEditor(true)}>
            + Editor
          </button>
        </div>
        {usingChart && (
          <div className="mt-2 space-y-2">
            {charts.length === 0 && (
              <div className="chart-empty">
                <p className="text-sm text-gray-400">
                  No custom charts yet — make one in the editor.
                </p>
                <button
                  className="small-btn mt-2"
                  onClick={() => setShowEditor(true)}
                >
                  Open editor
                </button>
              </div>
            )}
            {charts.map((c) => (
              <div key={c.id} className="chart-row">
                <button
                  className={`chart-name ${settings.chartId === c.id ? 'active' : ''}`}
                  onClick={() =>
                    setSettings((p) => ({ ...p, chartId: c.id }))
                  }
                >
                  {c.name} · {c.notes.length} notes
                </button>
                <button
                  className="icon-btn"
                  onClick={() => handleDeleteChart(c.id)}
                  aria-label="Delete chart"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {activeChart && (
              <p className="text-sm text-gray-400">
                Playing: {activeChart.name} ({activeChart.notes.length} notes)
              </p>
            )}
          </div>
        )}
      </div>

      {!usingChart && (
        <>
          <div className="settings-grid grid grid-cols-1 gap-4">
            <div className="setting-group">
              <label className={labelCls}>Pattern Type</label>
              <select
                name="patternType"
                value={settings.patternType}
                onChange={handleChange}
                className={selectCls}
              >
                {Object.entries(PATTERN_TYPES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {key}
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-group">
              <label className={labelCls}>BPM</label>
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
              <label className={labelCls}>Rate Mod</label>
              <select
                name="rateMod"
                value={settings.rateMod}
                onChange={handleChange}
                className={selectCls}
              >
                {Object.keys(RATE_MODS).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-group">
              <label className={labelCls}>Duration (seconds)</label>
              <input
                type="number"
                name="duration"
                min="10"
                max="120"
                value={settings.duration}
                onChange={handleChange}
                className={selectCls}
              />
            </div>

            <div className="setting-group">
              <label className={labelCls}>Note Count</label>
              <input
                type="number"
                name="noteCount"
                min="10"
                max="500"
                value={settings.noteCount}
                onChange={handleChange}
                className={selectCls}
              />
            </div>

            <div className="setting-group">
              <label className={labelCls}>Density</label>
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
              <label className={labelCls}>Seed</label>
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
                <label className={labelCls}>Jack Length</label>
                <input
                  type="number"
                  name="jackLength"
                  min="1"
                  max="8"
                  value={settings.jackLength}
                  onChange={handleChange}
                  className={selectCls}
                />
              </div>
            )}

            {settings.patternType === PATTERN_TYPES.SPEED && (
              <div className="setting-group">
                <label className={labelCls}>Speed Increment (BPM)</label>
                <input
                  type="number"
                  name="speedIncrement"
                  min="1"
                  max="20"
                  value={settings.speedIncrement}
                  onChange={handleChange}
                  className={selectCls}
                />
              </div>
            )}

            <div className="setting-group">
              <label className={labelCls}>Hold Notes</label>
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
          </div>

          {/* ---- mixer ---- */}
          <div className="setting-group">
            <label className={labelCls}>
              Pattern Mixer{' '}
              <span className="text-gray-400 font-normal">
                (chain patterns in one run)
              </span>
            </label>
            <div className="mixer-grid">
              {Object.entries(PATTERN_TYPES).map(([key, value]) => (
                <label key={value} className="mixer-item">
                  <input
                    type="checkbox"
                    checked={(settings.mixer || []).includes(value)}
                    onChange={() => toggleMixer(value)}
                  />
                  <span>{key}</span>
                </label>
              ))}
            </div>
            {(settings.mixer || []).length > 0 && (
              <button
                className="text-sm text-gray-400 underline mt-1"
                onClick={() => setSettings((p) => ({ ...p, mixer: [] }))}
              >
                Clear mixer
              </button>
            )}
          </div>

          {/* ---- section ---- */}
          <div className="setting-group">
            <label className={labelCls}>
              Section Practice{' '}
              <span className="text-gray-400 font-normal">(seconds)</span>
            </label>
            <div className="flex space-x-2 items-center">
              <input
                type="number"
                name="sectionStart"
                min="0"
                placeholder="from"
                value={settings.sectionStart ?? ''}
                onChange={handleChange}
                className="w-full p-2 bg-gray-800 rounded text-white"
              />
              <input
                type="number"
                name="sectionEnd"
                min="0"
                placeholder="to"
                value={settings.sectionEnd ?? ''}
                onChange={handleChange}
                className="w-full p-2 bg-gray-800 rounded text-white"
              />
              <label className="flex items-center space-x-1 text-sm text-white whitespace-nowrap">
                <input
                  type="checkbox"
                  name="loopSection"
                  checked={!!settings.loopSection}
                  onChange={handleChange}
                />
                <span>Loop</span>
              </label>
            </div>
          </div>

          {/* ---- ghost ---- */}
          <div className="setting-group">
            <label className={labelCls}>Ghost Rival</label>
            <select
              name="ghost"
              value={settings.ghost || ''}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  ghost: e.target.value || null,
                }))
              }
              className={selectCls}
            >
              <option value="">Off</option>
              <option value="easy">Easy bot</option>
              <option value="normal">Normal bot</option>
              <option value="hard">Hard bot</option>
            </select>
          </div>
        </>
      )}

      {/* ---- feel ---- */}
      <div className="settings-grid grid grid-cols-1 gap-4">
        <div className="setting-group">
          <label className={labelCls}>Scroll Speed</label>
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
          <label className={labelCls}>Skin</label>
          <select
            name="skin"
            value={settings.skin}
            onChange={handleChange}
            className={selectCls}
          >
            {Object.entries(SKINS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label className={labelCls}>Metronome</label>
          <div className="flex space-x-2">
            <label className="flex items-center space-x-2 p-2 bg-gray-800 rounded text-white cursor-pointer flex-1">
              <input
                type="checkbox"
                name="metronome"
                checked={!!settings.metronome}
                onChange={handleChange}
              />
              <span className="text-sm">Click on every beat</span>
            </label>
            <select
              name="signature"
              value={settings.signature}
              onChange={handleChange}
              className="p-2 bg-gray-800 rounded text-white"
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
            </select>
          </div>
        </div>

        <div className="setting-group">
          <label className={labelCls}>Hitsound</label>
          <div className="flex space-x-2 items-center">
            <label className="flex items-center space-x-2 p-2 bg-gray-800 rounded text-white cursor-pointer">
              <input
                type="checkbox"
                name="hitsound"
                checked={!!settings.hitsound}
                onChange={handleChange}
              />
              <span className="text-sm">Tap sound</span>
            </label>
            <input
              type="range"
              name="hitsoundVolume"
              min="0"
              max="1"
              step="0.1"
              value={settings.hitsoundVolume ?? 0.5}
              onChange={handleChange}
              className="w-full"
            />
          </div>
        </div>

        <div className="setting-group">
          <label className={labelCls}>Play Modifiers</label>
          <div className="mod-grid">
            <label className="mod-item">
              <input
                type="checkbox"
                name="upscroll"
                checked={!!settings.upscroll}
                onChange={handleChange}
              />
              <span>Upscroll</span>
            </label>
            <label className="mod-item">
              <input
                type="checkbox"
                name="failMode"
                checked={!!settings.failMode}
                onChange={handleChange}
              />
              <span>Fail mode</span>
            </label>
            <label className="mod-item">
              <input
                type="checkbox"
                name="colorblind"
                checked={!!settings.colorblind}
                onChange={handleChange}
              />
              <span>Colorblind palette</span>
            </label>
            <label className="mod-item">
              <input
                type="checkbox"
                name="reduceMotion"
                checked={!!settings.reduceMotion}
                onChange={handleChange}
              />
              <span>Reduce motion</span>
            </label>
          </div>
        </div>

        <div className="setting-group">
          <label className={labelCls}>
            <Music size={14} className="inline mr-1" />
            Background Music
          </label>
          <label className="file-btn">
            {musicName || 'Choose MP3…'}
            <input type="file" accept="audio/*" onChange={handleMusicFile} hidden />
          </label>
        </div>

        <div className="setting-group">
          <label className={labelCls}>Key Binds</label>
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
      {notice && <div className="dashboard-notice">{notice}</div>}

      <button onClick={handleShare} className="share-btn">
        <Link2 size={16} /> {shared ? 'Link copied!' : 'Copy share link'}
      </button>

      {/* ---- presets ---- */}
      <div className="panel">
        <h3 className="panel-title">
          <Save size={16} /> Presets
        </h3>
        <div className="flex space-x-2">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name…"
            className="flex-1 p-2 bg-gray-800 rounded text-white"
          />
          <button onClick={handleSavePreset} className="small-btn">
            Save current
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {presets.map((p) => (
            <div key={p.name} className="preset-row">
              <button
                className="preset-name"
                onClick={() => handleLoadPreset(p)}
              >
                {p.name}
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  deletePreset(p.name);
                  setPresets(getPresets());
                }}
                aria-label="Delete preset"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {presets.length === 0 && (
            <p className="text-sm text-gray-500">No presets yet.</p>
          )}
        </div>
      </div>

      {/* ---- goals ---- */}
      <div className="panel">
        <h3 className="panel-title">
          <Target size={16} /> Goals
        </h3>
        <div className="flex space-x-2">
          <select
            value={goalPattern}
            onChange={(e) => setGoalPattern(e.target.value)}
            className="flex-1 p-2 bg-gray-800 rounded text-white"
          >
            {Object.entries(PATTERN_TYPES).map(([key, value]) => (
              <option key={key} value={value}>
                {key}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="50"
            max="100"
            value={goalAcc}
            onChange={(e) => setGoalAcc(Number(e.target.value))}
            className="w-20 p-2 bg-gray-800 rounded text-white"
          />
          <button onClick={handleAddGoal} className="small-btn">
            Add
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {goals.map((g) => {
            const best = getBestAcc(g.patternType);
            const pct = Math.min(100, (best / g.targetAcc) * 100);
            return (
              <div key={g.id} className="goal-row">
                <div className="flex justify-between text-sm">
                  <span>
                    {g.patternType} — {g.targetAcc}%
                  </span>
                  <span className="text-gray-400">
                    best {best.toFixed(1)}%
                  </span>
                </div>
                <div className="goal-bar">
                  <div
                    className="goal-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <button
                  className="icon-btn"
                  onClick={() => {
                    deleteGoal(g.id);
                    setGoals(getGoals());
                  }}
                  aria-label="Delete goal"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          {goals.length === 0 && (
            <p className="text-sm text-gray-500">No goals yet.</p>
          )}
        </div>
      </div>

      {/* ---- skill / streak / achievements ---- */}
      <div className="panel">
        <h3 className="panel-title">
          <Flame size={16} /> Progress
        </h3>
        <div className="text-sm text-white mb-2">
          {streak}-day streak {streak >= 7 ? '🔥' : ''}
        </div>
        <div className="heatmap">
          {recentDays.map((d) => (
            <div
              key={d.date}
              className={`heat-cell ${d.active ? 'on' : ''}`}
              title={d.date}
            />
          ))}
        </div>
        {Object.keys(ratings).length > 0 && (
          <div className="mt-2">
            <div className="text-sm text-gray-400 mb-1">Skill ratings</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(ratings).map(([fam, bpm]) => (
                <span key={fam} className="rating-chip">
                  {fam}: {Math.round(bpm)} BPM
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h3 className="panel-title">
          <Award size={16} /> Achievements ({Object.keys(achievements).length}/
          {ACHIEVEMENT_DEFS.length})
        </h3>
        <div className="ach-grid">
          {ACHIEVEMENT_DEFS.map((a) => (
            <div
              key={a.id}
              className={`ach ${achievements[a.id] ? 'unlocked' : 'locked'}`}
              title={a.desc}
            >
              {achievements[a.id] ? '🏆' : '🔒'} {a.name}
            </div>
          ))}
        </div>
      </div>

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

      {showEditor && (
        <ChartEditor
          onSave={handleSaveChart}
          onPlay={handlePlayChart}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
