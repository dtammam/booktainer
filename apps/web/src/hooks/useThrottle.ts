import { useCallback, useRef } from "react";

export function useThrottle<T extends (...args: never[]) => void>(fn: T, delay: number) {
  const lastCall = useRef(0);
  const timeout = useRef<number | null>(null);
  const lastArgs = useRef<Parameters<T> | null>(null);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall.current);
    lastArgs.current = args;

    if (remaining <= 0) {
      if (timeout.current) {
        window.clearTimeout(timeout.current);
        timeout.current = null;
      }
      lastCall.current = now;
      fn(...args);
      return;
    }

    if (!timeout.current) {
      timeout.current = window.setTimeout(() => {
        lastCall.current = Date.now();
        timeout.current = null;
        if (lastArgs.current) {
          fn(...(lastArgs.current as Parameters<T>));
        }
      }, remaining);
    }
  }, [fn, delay]);
}
