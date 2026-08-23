import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * To support static rendering, the scheme must be recalculated on the client.
 * useSyncExternalStore gives us a hydration-safe "are we on the client yet" flag:
 * the server snapshot is false, the client snapshot true.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : 'light';
}
