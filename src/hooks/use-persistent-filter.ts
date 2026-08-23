import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_FILTER, type FilterState } from '@/lib/filter';

const STORAGE_KEY = 'boardgame-shelf.filter';

/**
 * Filter state that survives a reload. The search text is deliberately not persisted —
 * coming back to a list silently filtered by an old query is confusing.
 */
export function usePersistentFilter() {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTER);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = JSON.parse(raw) as Partial<FilterState>;
        setState({ ...DEFAULT_FILTER, ...stored, search: '' });
      })
      .catch(() => {
        // A corrupt or unreadable preference should never block the library.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: FilterState) => {
    setState(next);
    const { search: _search, ...persisted } = next;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, []);

  return [state, update] as const;
}
