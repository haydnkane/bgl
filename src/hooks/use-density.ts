import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'boardgame-shelf.density';

/** How tightly the shelf tiles games. Persisted, like the filter. */
export type Density = 'default' | 'condensed';

/** Above this the shelf is treated as a desktop and fits one more tile per row. */
const DESKTOP_WIDTH = 900;

const COLUMNS: Record<Density, { phone: number; desktop: number }> = {
  default: { phone: 2, desktop: 3 },
  condensed: { phone: 3, desktop: 4 },
};

export function columnsFor(density: Density, width: number): number {
  const counts = COLUMNS[density];
  return width >= DESKTOP_WIDTH ? counts.desktop : counts.phone;
}

export function usePersistentDensity() {
  const [density, setDensity] = useState<Density>('default');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || (raw !== 'default' && raw !== 'condensed')) return;
        setDensity(raw);
      })
      .catch(() => {
        // An unreadable preference should never block the shelf.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: Density) => {
    setDensity(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return [density, update] as const;
}
