import { stepValue } from './numStep.js';

describe('stepValue', () => {
  test('steps by 1 by default and clamps to min/max', () => {
    expect(stepValue(204, 1)).toBe(205);
    expect(stepValue(204, -1)).toBe(203);
    expect(stepValue(1, -1, 1, 1, 2000)).toBe(1);
    expect(stepValue(2000, 1, 1, 1, 2000)).toBe(2000);
  });

  test('steps by the field step and rounds decimals', () => {
    expect(stepValue(3.2, 1, 0.1)).toBe(3.3);
    expect(stepValue(3.2, -1, 0.1)).toBe(3.1);
    expect(stepValue(1, 1, 0.25)).toBe(1.25);
  });

  test('falls back to the default when the current value is not a number', () => {
    expect(stepValue(NaN, 1, 1, undefined, undefined, 100)).toBe(101);
    expect(stepValue(undefined, -1, 1, undefined, undefined, 140)).toBe(139);
  });
});
