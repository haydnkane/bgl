import type { GameWithLabels } from './types';

export type SortKey = 'name' | 'year_published' | 'rating' | 'created_at';
export type SortDirection = 'asc' | 'desc';
/** 'any' = game has at least one selected label, 'all' = it has every selected label. */
export type LabelMode = 'any' | 'all';

export type FilterState = {
  search: string;
  labelIds: string[];
  labelMode: LabelMode;
  sortKey: SortKey;
  sortDirection: SortDirection;
};

export const DEFAULT_FILTER: FilterState = {
  search: '',
  labelIds: [],
  labelMode: 'any',
  sortKey: 'name',
  sortDirection: 'asc',
};

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'year_published', label: 'Year' },
  { key: 'rating', label: 'My rating' },
  { key: 'created_at', label: 'Date added' },
];

function matchesSearch(game: GameWithLabels, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return game.name.toLowerCase().includes(needle);
}

function matchesLabels(game: GameWithLabels, labelIds: string[], mode: LabelMode): boolean {
  if (labelIds.length === 0) return true;
  const owned = new Set(game.labelIds);
  return mode === 'all'
    ? labelIds.every((id) => owned.has(id))
    : labelIds.some((id) => owned.has(id));
}

/**
 * Compares two sort values. Nulls always sort last regardless of direction, so an
 * unrated game never displaces a rated one at the top of the list.
 */
function compareValues(a: string | number | null, b: string | number | null, direction: SortDirection) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  let result: number;
  if (typeof a === 'string' && typeof b === 'string') {
    result = a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  } else {
    result = Number(a) - Number(b);
  }
  return direction === 'asc' ? result : -result;
}

function sortValue(game: GameWithLabels, key: SortKey): string | number | null {
  switch (key) {
    case 'name':
      return game.name;
    case 'year_published':
      return game.year_published;
    case 'rating':
      return game.rating;
    case 'created_at':
      return game.created_at;
  }
}

/** Search, filter and sort the cached library. Pure — safe to call on every render. */
export function applyFilters(games: GameWithLabels[], state: FilterState): GameWithLabels[] {
  const filtered = games.filter(
    (game) =>
      matchesSearch(game, state.search) &&
      matchesLabels(game, state.labelIds, state.labelMode)
  );

  return filtered.sort((a, b) => {
    const primary = compareValues(sortValue(a, state.sortKey), sortValue(b, state.sortKey), state.sortDirection);
    if (primary !== 0) return primary;
    // Name is the tiebreaker so equal values (and ties among nulls) stay in a stable, readable order.
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
