import { useState } from 'react';
import {
  Settings,
  Play,
  ArrowRight,
  Dices,
  Trophy,
  History,
  Link2,
  Trash2,
  Flame,
  Award,
  ChevronDown,
  Upload,
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
  getAchievements,
  ACHIEVEMENT_DEFS,
  getRecentDays,
  computeRatings,
} from '../storage';
import { configKey } from '../utils';
import { parseChartFile, SUPPORTED_CHART_EXTENSIONS } from '../chartImport';
import ChartEditor from './ChartEditor';

const randomSeed = () => Math.floor(Math.random() * 100000);

// Numeric input you can fully clear while editing. On blur (or Enter) an
// empty or invalid value snaps back to the field's default instead of
// poisoning the run with NaN.
const NumInput = ({
  name,
  value,
  defaultValue,
  min,
  max,
  step,
  onCommit,
  className,
}) => {
  const [text, setText] = useState(null); // null = not editing
  const shown = text ?? String(value ?? '');
  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text);
    if (text.trim() === '' || !Number.isFinite(n)) {
      onCommit(name, defaultValue);
    } else {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onCommit(name, v);
    }
    setText(null);
  };
  return (
    <input
      type="number"
      name={name}
      min={min}
      max={max}
      step={step}
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
      }}
      className={className}
    />
  );
};

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
  const [achievements] = useState(() => getAchievements());
  const [ratings] = useState(() => computeRatings());
  const [recentDays] = useState(() => getRecentDays(14));
  const [showEditor, setShowEditor] = useState(false);
  const [chartTab, setChartTab] = useState(false);
  const [notice, setNotice] = useState('');
  const [shared, setShared] = useState(false);

  const numOr = (v, d) => (Number.isFinite(v) ? v : d);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => {
      if (type === 'checkbox') return { ...prev, [name]: checked };
      if (name === 'holdChance')
        return { ...prev, holdChance: parseFloat(value) / 100 };
      return { ...prev, [name]: value };
    });
  };

  const handleNumCommit = (name, v) =>
    setSettings((prev) => ({ ...prev, [name]: v }));

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

  const handleStart = () => {
    const safe = {
      ...settings,
      duration: Math.min(600, Math.max(5, numOr(settings.duration, 30))),
      noteCount: Math.max(1, Math.round(numOr(settings.noteCount, 100))),
      bpm: Math.min(300, Math.max(60, numOr(settings.bpm, 140))),
      scrollSpeed: Math.min(25, Math.max(1, numOr(settings.scrollSpeed, 1))),
      density: Math.min(2, Math.max(0.5, numOr(settings.density, 1))),
      seed: Math.floor(numOr(settings.seed, randomSeed())),
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
    saveSettings(out);
    onStartGame(out);
  };

  const handleShare = async () => {
    const data = btoa(
      unescape(encodeURIComponent(JSON.stringify(settings)))
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
    const s = { ...settings, chartId: chart.id };
    saveSettings(s);
    onStartGame(s);
  };
  const handleDeleteChart = (id) => {
    deleteChart(id);
    setCharts(getCharts());
    if (settings.chartId === id) {
      setSettings((prev) => ({ ...prev, chartId: null }));
    }
  };
  const handleImportFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const text = await f.text();
    const parsed = parseChartFile(f.name, text);
    if (!parsed || parsed.notes.length === 0) {
      setNotice(`Couldn't import ${f.name} — no 4-key chart found in it.`);
      return;
    }
    const chart = {
      id: `chart-${Date.now()}`,
      name: parsed.name,
      notes: parsed.notes,
    };
    saveChart(chart);
    setCharts(getCharts());
    setNotice(`Imported "${parsed.name}" (${parsed.notes.length} notes).`);
  };

  const pb = chartTab ? null : getPB(configKey(settings));
  const usingChart = chartTab;
  const activeChart = charts.find((c) => c.id === settings.chartId);

  const selectCls = 'w-full p-2 bg-gray-800 rounded text-white';
  const labelCls = 'block text-sm font-medium mb-1 text-white';
  const numCls = 'w-20 p-2 bg-gray-800 rounded text-white';

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

      {/* ---- quick setup: essentials + play, always above the fold ---- */}
      <div className="quick-setup">
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
                    No custom charts yet — make one in the editor or import
                    one.
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
              <label className="import-btn">
                <Upload size={14} /> Import .sm / .ssc / .osu
                <input
                  type="file"
                  accept={SUPPORTED_CHART_EXTENSIONS}
                  onChange={handleImportFile}
                  hidden
                />
              </label>
              {activeChart && (
                <p className="text-sm text-gray-400">
                  Playing: {activeChart.name} ({activeChart.notes.length}{' '}
                  notes)
                </p>
              )}
            </div>
          )}
        </div>

        {!usingChart && (
          <div className="quick-grid">
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
                  value={numOr(settings.bpm, 140)}
                  onChange={handleChange}
                  className="w-full"
                />
                <NumInput
                  name="bpm"
                  value={settings.bpm}
                  defaultValue={140}
                  min={60}
                  max={300}
                  onCommit={handleNumCommit}
                  className={numCls}
                />
              </div>
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
                  value={numOr(settings.density, 1)}
                  onChange={handleChange}
                  className="w-full"
                />
                <span className="w-20 p-2 bg-gray-800 rounded text-white text-center">
                  {numOr(settings.density, 1)}x
                </span>
              </div>
            </div>

            <div className="setting-group">
              <label className={labelCls}>Duration (sec)</label>
              <NumInput
                name="duration"
                value={settings.duration}
                defaultValue={30}
                min={5}
                max={600}
                onCommit={handleNumCommit}
                className={selectCls}
              />
            </div>

            <div className="setting-group">
              <label className={labelCls}>Note Count</label>
              <NumInput
                name="noteCount"
                value={settings.noteCount}
                defaultValue={100}
                min={1}
                max={2000}
                onCommit={handleNumCommit}
                className={selectCls}
              />
            </div>

            <div className="setting-group">
              <label className={labelCls}>Scroll Speed</label>
              <div className="flex space-x-2">
                <input
                  type="range"
                  name="scrollSpeed"
                  min="1"
                  max="25"
                  step="0.1"
                  value={numOr(settings.scrollSpeed, 10)}
                  onChange={handleChange}
                  className="w-full"
                />
                <NumInput
                  name="scrollSpeed"
                  value={settings.scrollSpeed}
                  defaultValue={1}
                  min={1}
                  max={25}
                  step={0.1}
                  onCommit={handleNumCommit}
                  className={numCls}
                />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          className="w-full bg-mania-2 hover:bg-mania-1 text-white font-bold py-3 px-4 rounded flex items-center justify-center space-x-2 mt-3"
        >
          <Play size={20} />
          <span>Start Practice</span>
          <ArrowRight size={20} />
        </button>
        {notice && <div className="dashboard-notice">{notice}</div>}
      </div>

      {/* ---- additional settings (collapsed by default) ---- */}
      <details className="more-settings">
        <summary className="more-settings-toggle">
          <ChevronDown size={16} /> Additional settings
        </summary>
        <div className="settings-grid grid grid-cols-1 gap-4 mt-3">
          {!usingChart && (
            <>
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
                <label className={labelCls}>Seed</label>
                <div className="flex space-x-2">
                  <NumInput
                    name="seed"
                    value={settings.seed}
                    defaultValue={randomSeed()}
                    min={0}
                    onCommit={handleNumCommit}
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
                  <NumInput
                    name="jackLength"
                    value={settings.jackLength}
                    defaultValue={4}
                    min={1}
                    max={8}
                    onCommit={handleNumCommit}
                    className={selectCls}
                  />
                </div>
              )}

              {settings.patternType === PATTERN_TYPES.SPEED && (
                <div className="setting-group">
                  <label className={labelCls}>Speed Increment (BPM)</label>
                  <NumInput
                    name="speedIncrement"
                    value={settings.speedIncrement}
                    defaultValue={5}
                    min={1}
                    max={20}
                    onCommit={handleNumCommit}
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
      </details>

      <button onClick={handleShare} className="share-btn">
        <Link2 size={16} /> {shared ? 'Link copied!' : 'Copy share link'}
      </button>

      {/* ---- progress (heatmap + ratings) ---- */}
      <div className="panel">
        <h3 className="panel-title">
          <Flame size={16} /> Progress
        </h3>
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
