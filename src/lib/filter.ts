import type { GameRating, GameWithLabels } from './types';

export type SortKey = 'name' | 'year_published' | 'rating' | 'created_at';
export type SortDirection = 'asc' | 'desc';
/** 'any' = game has at least one selected label, 'all' = it has every selected label. */
export type LabelMode = 'any' | 'all';

export type FilterState = {
  search: string;
  labelIds: string[];
  labelMode: LabelMode;
  /**
   * User ids whose hearted games to show. Several at once reads as "or": a game is kept if
   * any of them hearted it, which is what tapping two people's pills is asking for.
   */
  heartedBy: string[];
  sortKey: SortKey;
  sortDirection: SortDirection;
};

export const DEFAULT_FILTER: FilterState = {
  search: '',
  labelIds: [],
  labelMode: 'any',
  heartedBy: [],
  sortKey: 'name',
  sortDirection: 'asc',
};

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'year_published', label: 'Year' },
  { key: 'rating', label: 'My rating' },
  { key: 'created_at', label: 'Date added' },
];

/**
 * Ratings arranged for the two questions the list asks of them, so neither costs a scan of
 * every rating on the shelf per game.
 */
export type RatingIndex = {
  /** The viewer's own score, by game id. Feeds the "My rating" sort. */
  myStars: ReadonlyMap<string, number>;
  /** The games each person has hearted, by user id. Feeds the hearted-by pills. */
  heartsByUser: ReadonlyMap<string, ReadonlySet<string>>;
};

/** What a screen uses before the ratings have loaded, and what the sort falls back to. */
export const NO_RATINGS: RatingIndex = {
  myStars: new Map(),
  heartsByUser: new Map(),
};

/** Builds the index above. Pure; call it from a useMemo keyed on the rows and the viewer. */
export function indexRatings(rows: GameRating[], viewerId: string | null): RatingIndex {
  const myStars = new Map<string, number>();
  const heartsByUser = new Map<string, Set<string>>();

  for (const row of rows) {
    if (row.stars !== null && row.user_id === viewerId) myStars.set(row.game_id, row.stars);
    if (!row.hearted) continue;
    const hearted = heartsByUser.get(row.user_id) ?? new Set<string>();
    hearted.add(row.game_id);
    heartsByUser.set(row.user_id, hearted);
  }

  return { myStars, heartsByUser };
}

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

function matchesHearts(game: GameWithLabels, userIds: string[], ratings: RatingIndex): boolean {
  if (userIds.length === 0) return true;
  return userIds.some((userId) => ratings.heartsByUser.get(userId)?.has(game.id) ?? false);
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

function sortValue(
  game: GameWithLabels,
  key: SortKey,
  ratings: RatingIndex
): string | number | null {
  switch (key) {
    case 'name':
      return game.name;
    case 'year_published':
      return game.year_published;
    case 'rating':
      // "My rating" means the viewer's own stars; nobody else's opinion reorders their list.
      return ratings.myStars.get(game.id) ?? null;
    case 'created_at':
      return game.created_at;
  }
}

/** Search, filter and sort the cached library. Pure — safe to call on every render. */
export function applyFilters(
  games: GameWithLabels[],
  state: FilterState,
  ratings: RatingIndex = NO_RATINGS
): GameWithLabels[] {
  const filtered = games.filter(
    (game) =>
      matchesSearch(game, state.search) &&
      matchesLabels(game, state.labelIds, state.labelMode) &&
      matchesHearts(game, state.heartedBy, ratings)
  );

  return filtered.sort((a, b) => {
    const primary = compareValues(
      sortValue(a, state.sortKey, ratings),
      sortValue(b, state.sortKey, ratings),
      state.sortDirection
    );
    if (primary !== 0) return primary;
    // Name is the tiebreaker so equal values (and ties among nulls) stay in a stable, readable order.
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
