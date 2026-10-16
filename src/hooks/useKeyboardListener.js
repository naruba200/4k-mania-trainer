import { useRef, useEffect, useCallback } from 'react';

export const useKeyboardListener = (keyBinds) => {
  const keyStates = useRef(new Map().set('d', false).set('f', false).set('j', false).set('k', false)).current;
  const onKeyDown = useCallback((e) => {
    const normalizedKey = keyBinds.includes(e.key) ? e.key : null;
    if (normalizedKey && !keyStates.get(normalizedKey)) {
      keyStates.set(normalizedKey, true);
    }
  }, [keyBinds]);

  const onKeyUp = useCallback((e) => {
    const normalizedKey = keyBinds.includes(e.key) ? e.key : null;
    if (normalizedKey) {
      keyStates.set(normalizedKey, false);
    }
  }, [keyBinds]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

  const isKeyPressed = (key) => {
    const normalizedKey = keyBinds.includes(key) ? key : null;
    if (!normalizedKey) return false;
    return keyStates.get(normalizedKey) || false;
  };

  return { isKeyPressed, keyStates };
};