import { useEffect, useState } from 'react';

/**
 * useState that survives leaving the page and coming back in the same tab (e.g. open a cart, then Back):
 * the value is kept in sessionStorage under `key`. `revive` fixes up what JSON can't hold (Infinity, Sets…).
 */
export function useSessionState<T>(key: string, initial: T, revive?: (stored: unknown) => T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return revive ? revive(parsed) : (parsed as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable — keep in memory only
    }
  }, [key, value]);
  return [value, setValue];
}
