import { useState, useRef } from 'react';
import {
  Settings,
  Play,
  ArrowRight,
  Dices,
  Trophy,
  History,
  Link2,
  Trash2,
  Pencil,
  Flame,
  Award,
  ChevronDown,
  Upload,
  X,
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
import {
  parseChartFile,
  parseOszFile,
  SUPPORTED_CHART_EXTENSIONS,
} from '../chartImport';
import ChartEditor from './ChartEditor';
import NumInput from './NumInput';

const randomSeed = () => Math.floor(Math.random() * 100000);

// Old saved settings / share links may still carry `duration` — it no
// longer exists, so strip it instead of letting it linger in state.
const stripDuration = (s) => {
  if (!s) return s;
  const { duration: _ignored, ...rest } = s;
  return rest;
};

const Dashboard = ({ onStartGame, initialSettings }) => {
  const [settings, setSettings] = useState(() => {
    const saved = stripDuration(loadSettings());
    const initial = stripDuration(initialSettings);
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      ...(initial || {}),
      seed: initial?.seed ?? saved?.seed ?? randomSeed(),
    };
  });
  const [history] = useState(() => getHistory());
  const [charts, setCharts] = useState(() => getCharts());
  const [achievements] = useState(() => getAchievements());
  const [ratings] = useState(() => computeRatings());
  const [recentDays] = useState(() => getRecentDays(14));
  const [showEditor, setShowEditor] = useState(false);
  const [editingChart, setEditingChart] = useState(null);
  const [chartTab, setChartTab] = useState(false);
  const [notice, setNotice] = useState('');
  const [shared, setShared] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [oszCandidates, setOszCandidates] = useState(null);
  const [oszChecked, setOszChecked] = useState([]);
  const [oszFileName, setOszFileName] = useState('');

  // Number-or-default that also coerces numeric strings (sliders and
  // share links can hand us "12.5" instead of 12.5).
  const numOr = (v, d) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : d;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => {
      if (type === 'checkbox') return { ...prev, [name]: checked };
      if (name === 'holdChance') {
        const n = parseFloat(value) / 100;
        return { ...prev, holdChance: Number.isFinite(n) ? n : prev[name] };
      }
      if (type === 'range') {
        // Range inputs report strings — store real numbers or the slider
        // snaps back to its fallback on every drag.
        const n = parseFloat(value);
        return { ...prev, [name]: Number.isFinite(n) ? n : prev[name] };
      }
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
      noteCount: Math.max(1, Math.round(numOr(settings.noteCount, 100))),
      bpm: Math.min(300, Math.max(60, numOr(settings.bpm, 140))),
      scrollSpeed: Math.min(25, Math.max(1, numOr(settings.scrollSpeed, 1))),
      density: Math.min(2, Math.max(0.5, numOr(settings.density, 1))),
      seed: Math.floor(numOr(settings.seed, randomSeed())),
    };
    delete safe.duration;
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
    setEditingChart(null);
  };
  const handlePlayChart = (chart) => {
    saveChart(chart);
    const list = getCharts();
    setCharts(list);
    setShowEditor(false);
    setEditingChart(null);
    setChartTab(true);
    const s = { ...settings, chartId: chart.id };
    saveSettings(s);
    onStartGame(s);
  };
  const handleEditChart = (chart) => {
    setEditingChart(chart);
    setShowEditor(true);
  };
  const handleDeleteChart = (id) => {
    deleteChart(id);
    setCharts(getCharts());
    if (settings.chartId === id) {
      setSettings((prev) => ({ ...prev, chartId: null }));
    }
  };

  // Import one dropped / picked file. .osz opens the difficulty picker;
  // .osu / .sm / .ssc import directly as before.
  const handleImportFiles = async (fileList) => {
    const f = fileList?.[0];
    if (!f) return;
    if (/\.osz$/i.test(f.name)) {
      const candidates = await parseOszFile(f);
      if (candidates.length === 0) {
        setNotice(`Couldn't import ${f.name} — no 4-key chart found in it.`);
        return;
      }
      setOszCandidates(candidates);
      setOszChecked(candidates.map((_, i) => i));
      setOszFileName(f.name);
      setNotice('');
      return;
    }
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

  const handleImportFile = async (e) => {
    const files = e.target.files;
    e.target.value = '';
    await handleImportFiles(files);
  };

  const handleImportOsz = () => {
    if (!oszCandidates) return;
    const picked = oszChecked
      .map((i) => oszCandidates[i])
      .filter(Boolean);
    if (picked.length === 0) {
      setNotice('Tick at least one difficulty to import.');
      return;
    }
    const stamp = Date.now();
    for (let i = 0; i < picked.length; i++) {
      saveChart({
        id: `chart-${stamp}-${i}`,
        name: picked[i].name,
        notes: picked[i].notes,
      });
    }
    setCharts(getCharts());
    setNotice(
      `Imported ${picked.length} chart${picked.length > 1 ? 's' : ''} from ${oszFileName}.`
    );
    setOszCandidates(null);
    setOszChecked([]);
  };

  const toggleOszCandidate = (i) => {
    setOszChecked((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  // Drag-and-drop anywhere on the dashboard. A counter (not a boolean
  // toggle) so dragenter/dragleave on child elements don't flicker it.
  const dragCount = useRef(0);
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCount.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setIsDragging(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    dragCount.current = 0;
    setIsDragging(false);
    await handleImportFiles(e.dataTransfer?.files);
  };

  const pb = chartTab ? null : getPB(configKey(settings));
  const usingChart = chartTab;
  const activeChart = charts.find((c) => c.id === settings.chartId);

  const selectCls = 'w-full p-2 bg-gray-800 rounded text-white';
  const labelCls = 'block text-sm font-medium mb-1 text-white';
  const numCls = 'w-20 p-2 bg-gray-800 rounded text-white';

  return (
    <div
      className="dashboard p-4 space-y-4"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          Drop .osz / .osu / .sm / .ssc here
        </div>
      )}
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
            <button className="source-tab" onClick={() => { setEditingChart(null); setShowEditor(true); }}>
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
                    onClick={() => { setEditingChart(null); setShowEditor(true); }}
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
                    onClick={() => handleEditChart(c)}
                    aria-label="Edit chart"
                    title="Edit chart"
                  >
                    <Pencil size={16} />
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
                <Upload size={14} /> Import .sm / .ssc / .osu / .osz
                <input
                  type="file"
                  accept={SUPPORTED_CHART_EXTENSIONS}
                  onChange={handleImportFile}
                  hidden
                />
              </label>
              <p className="text-sm text-gray-400">
                Or drop a chart file anywhere on this page.
              </p>
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
          initialChart={editingChart}
          onSave={handleSaveChart}
          onPlay={handlePlayChart}
          onClose={() => { setShowEditor(false); setEditingChart(null); }}
        />
      )}

      {oszCandidates && (
        <div className="editor-overlay">
          <div className="editor-panel">
            <div className="editor-header">
              <h2>Choose difficulties — {oszFileName}</h2>
              <button
                className="icon-btn"
                onClick={() => setOszCandidates(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              Tick the difficulties to import. Each becomes its own chart
              (music and images are ignored).
            </p>
            <div className="osz-list">
              {oszCandidates.map((c, i) => (
                <label key={c.name} className="osz-row">
                  <input
                    type="checkbox"
                    checked={oszChecked.includes(i)}
                    onChange={() => toggleOszCandidate(i)}
                  />
                  <span>{c.name}</span>
                  <span className="osz-count">{c.noteCount} notes</span>
                </label>
              ))}
            </div>
            <div className="editor-actions">
              <button type="button" onClick={handleImportOsz} className="primary">
                <Upload size={16} /> Import selected
              </button>
              <button type="button" onClick={() => setOszCandidates(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
