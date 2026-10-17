// Local persistence: settings, personal bests and run history.
// Everything is try/catch-guarded so private-mode browsers don't break.

const safeGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — play on without persisting
  }
};

export const loadSettings = () => safeGet('mania.settings', null);
export const saveSettings = (settings) => safeSet('mania.settings', settings);

export const getPB = (key) => safeGet(`mania.pb.${key}`, null);

// Saves when result beats the stored PB (higher score wins).
// Returns { isNewBest, pb, prev }.
export const trySavePB = (key, result) => {
  const prev = getPB(key);
  if (!prev || result.score > prev.score) {
    const pb = {
      score: result.score,
      accuracy: result.accuracy,
      maxCombo: result.maxCombo,
      date: Date.now(),
    };
    safeSet(`mania.pb.${key}`, pb);
    return { isNewBest: true, pb, prev };
  }
  return { isNewBest: false, pb: prev, prev };
};

export const logRun = (entry) => {
  const history = safeGet('mania.history', []);
  history.unshift(entry);
  safeSet('mania.history', history.slice(0, 50));
};

export const getHistory = () => safeGet('mania.history', []);

// ---- Custom charts ----
export const getCharts = () => safeGet('mania.charts', []);
export const saveChart = (chart) => {
  const charts = getCharts().filter((c) => c.id !== chart.id);
  charts.unshift(chart);
  safeSet('mania.charts', charts.slice(0, 50));
};
export const deleteChart = (id) =>
  safeSet(
    'mania.charts',
    getCharts().filter((c) => c.id !== id)
  );

// ---- Achievements ----
export const getAchievements = () => safeGet('mania.achievements', {});
export const unlockAchievement = (id) => {
  const ach = getAchievements();
  if (!ach[id]) {
    ach[id] = Date.now();
    safeSet('mania.achievements', ach);
    return true;
  }
  return false;
};

export const ACHIEVEMENT_DEFS = [
  { id: 'first-fc', name: 'Full Combo', desc: 'Full-combo any chart' },
  { id: 'acc-95', name: 'Clean', desc: 'Reach 95% accuracy' },
  { id: 'acc-98', name: 'Surgical', desc: 'Reach 98% accuracy' },
  { id: 'score-50k', name: '50K Club', desc: 'Score 50,000 in one run' },
  { id: 'score-100k', name: '100K Club', desc: 'Score 100,000 in one run' },
  { id: 'runs-10', name: 'Grinder', desc: 'Complete 10 runs' },
];

// ---- Play-day history (powers the 14-day heatmap) ----
export const recordPlayDate = () => {
  const days = safeGet('mania.days', []);
  const today = new Date().toISOString().slice(0, 10);
  if (!days.includes(today)) {
    days.unshift(today);
    safeSet('mania.days', days.slice(0, 90));
  }
};

export const getRecentDays = (n = 14) => {
  const days = new Set(safeGet('mania.days', []));
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, active: days.has(key) });
    d.setDate(d.getDate() - 1);
  }
  return out;
};

// Best accuracy ever for a pattern family (any config).
export const getBestAcc = (patternType) => {
  let best = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('mania.pb.')) continue;
      if (k.slice('mania.pb.'.length).split('|')[0] !== patternType) continue;
      const pb = JSON.parse(localStorage.getItem(k));
      if (pb && pb.accuracy > best) best = pb.accuracy;
    }
  } catch {
    // ignore
  }
  return best;
};

// ---- Skill ratings: best effective BPM per pattern family at 90%+ acc ----
export const computeRatings = () => {
  const ratings = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('mania.pb.')) continue;
      const pb = JSON.parse(localStorage.getItem(k));
      const family = k.slice('mania.pb.'.length).split('|')[0];
      if (!pb || pb.accuracy < 90) continue;
      const bpm = parseFloat(k.split('|')[1]) || 0;
      if (!ratings[family] || bpm > ratings[family]) ratings[family] = bpm;
    }
  } catch {
    // ignore
  }
  return ratings;
};
