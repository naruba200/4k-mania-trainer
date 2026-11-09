// Pure step arithmetic for the custom number-input steppers.
// current may be NaN/undefined while the user is editing — fall back to
// the field default. Steps by `step` (default 1), rounds to the step's
// decimal places (so 0.1 steps never produce 3.2000000000000002), and
// clamps to min/max.
export const stepValue = (current, dir, step = 1, min, max, fallback = 0) => {
  const cur = Number.isFinite(current) ? current : fallback;
  const s = Number.isFinite(step) && step > 0 ? step : 1;
  const decimals = String(s).includes('.') ? String(s).split('.')[1].length : 0;
  let next = Number((cur + dir * s).toFixed(decimals));
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};
