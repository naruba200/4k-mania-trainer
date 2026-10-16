import { useEffect, useRef } from 'react';

export const useGameLoop = (callback, dependencies = []) => {
  const requestRef = useRef();
  const previousTimeRef = useRef();
  const callbackRef = useRef(callback);

  // Always call the latest callback without restarting the loop.
  callbackRef.current = callback;

  useEffect(() => {
    const loop = (time) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        callbackRef.current(deltaTime, time);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
    // `dependencies` is the caller's dep array — spread semantics, not [array].
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
};
