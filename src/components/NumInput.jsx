import { useState } from 'react';
import { stepValue } from '../numStep.js';

// Numeric input you can fully clear while editing. On blur (or Enter) an
// empty or invalid value snaps back to the field's default instead of
// poisoning the run with NaN.
//
// The browser's native up/down spinner is hidden (see App.css
// .num-input-wrap) and replaced with custom dark-theme ▲▼ buttons, which
// step by the field's `step`, clamp to min/max, and commit immediately.
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
  const stepBy = (dir) => {
    const cur = text !== null ? parseFloat(text) : Number(value);
    const next = stepValue(cur, dir, step ?? 1, min, max, defaultValue);
    setText(null);
    onCommit(name, next);
  };
  return (
    <span className="num-input-wrap">
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
      <span className="num-stepper" aria-hidden="false">
        <button
          type="button"
          tabIndex={-1}
          className="num-stepper-btn"
          aria-label="Increase"
          onClick={() => stepBy(1)}
        >
          ▲
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="num-stepper-btn"
          aria-label="Decrease"
          onClick={() => stepBy(-1)}
        >
          ▼
        </button>
      </span>
    </span>
  );
};

export default NumInput;
