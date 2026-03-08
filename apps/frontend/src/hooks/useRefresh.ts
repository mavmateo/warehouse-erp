import { useState, useCallback } from "react";

/**
 * Returns [tick, refresh].
 * Pass `tick` as a key or dep to force re-fetch; call `refresh()` after mutations.
 */
export function useRefresh(): [number, () => void] {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return [tick, refresh];
}
