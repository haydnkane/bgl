import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_FILTER, SORT_OPTIONS, type FilterState } from '@/lib/filter';

const STORAGE_KEY = 'boardgame-shelf.filter';

/**
 * Reconciles what was stored with what the app still offers. A preference written by an
 * older build can name a sort that no longer exists, which would leave the list in an
 * order no chip is showing as active.
 */
function reconcile(stored: Partial<FilterState>): FilterState {
  const next = { ...DEFAULT_FILTER, ...stored, search: '' };
  if (!SORT_OPTIONS.some((option) => option.key === next.sortKey)) {
    next.sortKey = DEFAULT_FILTER.sortKey;
    next.sortDirection = DEFAULT_FILTER.sortDirection;
  }
  return next;
}

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
        setState(reconcile(JSON.parse(raw) as Partial<FilterState>));
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
