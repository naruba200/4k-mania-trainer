import { useRef, useEffect, useCallback } from 'react';

export const useKeyboardListener = (keyBinds) => {
  const bindsRef = useRef([]);
  const keyStates = useRef(new Map());
  const pressQueueRef = useRef([]);

  // Keep the normalized binds fresh without writing refs during render.
  useEffect(() => {
    bindsRef.current = keyBinds.map((k) => (k || '').toLowerCase());
  });

  const onKeyDown = useCallback((e) => {
    if (e.repeat) return;
    const key = (e.key || '').toLowerCase();
    if (!bindsRef.current.includes(key)) return;
    if (!keyStates.current.get(key)) {
      keyStates.current.set(key, true);
      pressQueueRef.current.push({ key, time: Date.now() });
    }
  }, []);

  const onKeyUp = useCallback((e) => {
    const key = (e.key || '').toLowerCase();
    if (!bindsRef.current.includes(key)) return;
    keyStates.current.set(key, false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

  const isKeyPressed = useCallback((key) => {
    return keyStates.current.get((key || '').toLowerCase()) || false;
  }, []);

  // Drain queued keydown events. Each entry: { key, time } with a
  // Date.now() timestamp in the same clock as the game start time.
  const consumePresses = useCallback(() => {
    const presses = pressQueueRef.current;
    pressQueueRef.current = [];
    return presses;
  }, []);

  return { isKeyPressed, consumePresses };
};
