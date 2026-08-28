import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'boardgame-shelf.density';

/** How tightly the shelf tiles games. Persisted, like the filter. */
export type Density = 'default' | 'expanded';

/**
 * Where a phone becomes a tablet. Tablets and desktops fit the same number of tiles per
 * row, so this is the only width the grid has to care about — it sits low enough to catch
 * an iPad held in portrait.
 */
const TABLET_WIDTH = 700;

const COLUMNS: Record<Density, { phone: number; wide: number }> = {
  default: { phone: 3, wide: 6 },
  expanded: { phone: 2, wide: 4 },
};

export function columnsFor(density: Density, width: number): number {
  const counts = COLUMNS[density];
  return width >= TABLET_WIDTH ? counts.wide : counts.phone;
}

export function usePersistentDensity() {
  const [density, setDensity] = useState<Density>('default');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || (raw !== 'default' && raw !== 'expanded')) return;
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
