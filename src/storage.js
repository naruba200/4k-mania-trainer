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
