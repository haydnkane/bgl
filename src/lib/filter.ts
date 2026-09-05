import type { GameRating, GameWithLabels } from './types';

export type SortKey = 'name' | 'rating' | 'bgg_rating' | 'created_at';
export type SortDirection = 'asc' | 'desc';
/**
 * How several selected pills combine, for labels and hearts alike: 'any' keeps a game that
 * matches at least one of them, 'all' only one that matches every one.
 */
export type MatchMode = 'any' | 'all';

export type FilterState = {
  search: string;
  labelIds: string[];
  /** Applies to the label pills and the hearted-by pills together, as one shared choice. */
  matchMode: MatchMode;
  /** User ids whose hearted games to show, combined per {@link FilterState.matchMode}. */
  heartedBy: string[];
  /**
   * Keep only games somebody on the shelf scored this highly or better. One threshold at a
   * time: the options nest, so "4+ and 3+" would only ever mean 4+.
   */
  minStars: number | null;
  sortKey: SortKey;
  sortDirection: SortDirection;
};

export const DEFAULT_FILTER: FilterState = {
  search: '',
  labelIds: [],
  matchMode: 'any',
  heartedBy: [],
  minStars: null,
  sortKey: 'name',
  sortDirection: 'asc',
};

/** The star thresholds offered as pills, strongest last. */
export const MIN_STARS_OPTIONS: number[] = [3, 4, 5];

/**
 * The sorts offered as chips, each with the direction it opens on.
 *
 * Only names read naturally A-Z. For a score or a date the interesting end is the top —
 * the best rated, the most recently added — so those open descending and a second tap
 * flips them.
 */
export const SORT_OPTIONS: { key: SortKey; label: string; defaultDirection: SortDirection }[] = [
  { key: 'name', label: 'Name', defaultDirection: 'asc' },
  { key: 'rating', label: 'My rating', defaultDirection: 'desc' },
  { key: 'bgg_rating', label: 'BGG score', defaultDirection: 'desc' },
  { key: 'created_at', label: 'Date added', defaultDirection: 'desc' },
];

/** The direction a sort opens on when it is first tapped. */
export function defaultDirectionFor(key: SortKey): SortDirection {
  return SORT_OPTIONS.find((option) => option.key === key)?.defaultDirection ?? 'asc';
}

/**
 * Ratings arranged for the two questions the list asks of them, so neither costs a scan of
 * every rating on the shelf per game.
 */
export type RatingIndex = {
  /** The viewer's own score, by game id. Feeds the "My rating" sort. */
  myStars: ReadonlyMap<string, number>;
  /** The games each person has hearted, by user id. Feeds the hearted-by pills. */
  heartsByUser: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * The highest score anyone on the shelf gave, by game id. Feeds the star-threshold pills,
   * which ask whether *someone* rated a game well, not whether the viewer did.
   */
  bestStars: ReadonlyMap<string, number>;
};

/** What a screen uses before the ratings have loaded, and what the sort falls back to. */
export const NO_RATINGS: RatingIndex = {
  myStars: new Map(),
  heartsByUser: new Map(),
  bestStars: new Map(),
};

/** Builds the index above. Pure; call it from a useMemo keyed on the rows and the viewer. */
export function indexRatings(rows: GameRating[], viewerId: string | null): RatingIndex {
  const myStars = new Map<string, number>();
  const heartsByUser = new Map<string, Set<string>>();
  const bestStars = new Map<string, number>();

  for (const row of rows) {
    if (row.stars !== null) {
      if (row.user_id === viewerId) myStars.set(row.game_id, row.stars);
      const best = bestStars.get(row.game_id);
      if (best === undefined || row.stars > best) bestStars.set(row.game_id, row.stars);
    }
    if (!row.hearted) continue;
    const hearted = heartsByUser.get(row.user_id) ?? new Set<string>();
    hearted.add(row.game_id);
    heartsByUser.set(row.user_id, hearted);
  }

  return { myStars, heartsByUser, bestStars };
}

function matchesSearch(game: GameWithLabels, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return game.name.toLowerCase().includes(needle);
}

function matchesLabels(game: GameWithLabels, labelIds: string[], mode: MatchMode): boolean {
  if (labelIds.length === 0) return true;
  const owned = new Set(game.labelIds);
  return mode === 'all'
    ? labelIds.every((id) => owned.has(id))
    : labelIds.some((id) => owned.has(id));
}

function matchesHearts(
  game: GameWithLabels,
  userIds: string[],
  mode: MatchMode,
  ratings: RatingIndex
): boolean {
  if (userIds.length === 0) return true;
  const hearted = (userId: string) => ratings.heartsByUser.get(userId)?.has(game.id) ?? false;
  // 'all' asks for the games this whole group agrees on — everyone's pick, not anyone's.
  return mode === 'all' ? userIds.every(hearted) : userIds.some(hearted);
}

function matchesStars(game: GameWithLabels, minStars: number | null, ratings: RatingIndex): boolean {
  if (minStars === null) return true;
  return (ratings.bestStars.get(game.id) ?? 0) >= minStars;
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
    case 'rating':
      // "My rating" means the viewer's own stars; nobody else's opinion reorders their list.
      return ratings.myStars.get(game.id) ?? null;
    case 'bgg_rating':
      // Games never imported from BGG have no score, and sort last like any other null.
      return game.bgg_rating;
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
      matchesLabels(game, state.labelIds, state.matchMode) &&
      matchesHearts(game, state.heartedBy, state.matchMode, ratings) &&
      matchesStars(game, state.minStars, ratings)
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
