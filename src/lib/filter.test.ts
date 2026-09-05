import { applyFilters, DEFAULT_FILTER, indexRatings, type FilterState } from './filter';
import type { GameRating, GameWithLabels } from './types';

const COOP = 'label-coop';
const HEAVY = 'label-heavy';

/** The signed-in user in these tests, and someone else on the same shelf. */
const ME = 'user-1';
const SAM = 'user-2';

function makeGame(overrides: Partial<GameWithLabels> & { name: string }): GameWithLabels {
  return {
    id: overrides.name.toLowerCase().replace(/\s+/g, '-'),
    library_id: 'library-1',
    user_id: 'user-1',
    bgg_id: null,
    image_url: null,
    thumbnail_url: null,
    year_published: null,
    min_players: null,
    max_players: null,
    playing_time: null,
    bgg_rating: null,
    notes: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    labelIds: [],
    ...overrides,
  };
}

const gloomhaven = makeGame({
  name: 'Gloomhaven',
  year_published: 2017,
  created_at: '2024-03-01T00:00:00Z',
  bgg_rating: 8.6,
  labelIds: [COOP, HEAVY],
});
const pandemic = makeGame({
  name: 'Pandemic',
  year_published: 2008,
  created_at: '2024-01-15T00:00:00Z',
  bgg_rating: 7.5,
  labelIds: [COOP],
});
const azul = makeGame({
  name: 'Azul',
  year_published: 2017,
  created_at: '2024-02-01T00:00:00Z',
  labelIds: [],
});

const library = [gloomhaven, pandemic, azul];

function rate(overrides: Partial<GameRating> & { game_id: string; user_id: string }): GameRating {
  return { stars: null, hearted: false, ...overrides };
}

/**
 * Gloomhaven and Pandemic are mine, scored 5 and 4; Azul I have not rated at all. Sam has
 * hearted Azul and scored Gloomhaven low, so his stars must never reach my sort.
 */
const ratingRows: GameRating[] = [
  rate({ game_id: 'gloomhaven', user_id: ME, stars: 5, hearted: true }),
  rate({ game_id: 'pandemic', user_id: ME, stars: 4 }),
  rate({ game_id: 'azul', user_id: SAM, hearted: true }),
  rate({ game_id: 'gloomhaven', user_id: SAM, stars: 1, hearted: true }),
  // Sam's 3 on Azul is the only score it has, and nobody but me has scored Pandemic.
  rate({ game_id: 'azul', user_id: SAM, stars: 3, hearted: true }),
];

const ratings = indexRatings(ratingRows, ME);

function withState(overrides: Partial<FilterState>): FilterState {
  return { ...DEFAULT_FILTER, ...overrides };
}

function names(games: GameWithLabels[]): string[] {
  return games.map((game) => game.name);
}

describe('search', () => {
  it('returns everything when the query is blank', () => {
    expect(applyFilters(library, DEFAULT_FILTER)).toHaveLength(3);
  });

  it('matches a case-insensitive substring of the name', () => {
    expect(names(applyFilters(library, withState({ search: 'HAVEN' })))).toEqual(['Gloomhaven']);
  });

  it('ignores surrounding whitespace', () => {
    expect(names(applyFilters(library, withState({ search: '  pan  ' })))).toEqual(['Pandemic']);
  });

  it('returns nothing when there is no match', () => {
    expect(applyFilters(library, withState({ search: 'catan' }))).toEqual([]);
  });
});

describe('label filtering', () => {
  it('returns everything when no labels are selected', () => {
    expect(applyFilters(library, withState({ labelIds: [] }))).toHaveLength(3);
  });

  it('"any" matches games carrying at least one selected label', () => {
    const result = applyFilters(library, withState({ labelIds: [COOP, HEAVY], matchMode: 'any' }));
    expect(names(result)).toEqual(['Gloomhaven', 'Pandemic']);
  });

  it('"all" requires every selected label', () => {
    const result = applyFilters(library, withState({ labelIds: [COOP, HEAVY], matchMode: 'all' }));
    expect(names(result)).toEqual(['Gloomhaven']);
  });

  it('excludes games with no labels at all', () => {
    const result = applyFilters(library, withState({ labelIds: [COOP] }));
    expect(names(result)).not.toContain('Azul');
  });

  it('combines with search', () => {
    // Co-op alone would keep Gloomhaven and Pandemic; the query narrows it to one.
    const result = applyFilters(library, withState({ search: 'p', labelIds: [COOP] }));
    expect(names(result)).toEqual(['Pandemic']);
  });
});

describe('sorting', () => {
  it('sorts by name ascending and descending', () => {
    expect(names(applyFilters(library, withState({ sortKey: 'name' })))).toEqual([
      'Azul',
      'Gloomhaven',
      'Pandemic',
    ]);
    expect(
      names(applyFilters(library, withState({ sortKey: 'name', sortDirection: 'desc' })))
    ).toEqual(['Pandemic', 'Gloomhaven', 'Azul']);
  });

  it('sorts by my own stars, not anyone else’s', () => {
    // Sam gave Gloomhaven a single star; it still comes top, because the sort is mine.
    const result = applyFilters(
      library,
      withState({ sortKey: 'rating', sortDirection: 'desc' }),
      ratings
    );
    expect(names(result)).toEqual(['Gloomhaven', 'Pandemic', 'Azul']);
  });

  it('sorts by the BGG score', () => {
    // Azul was never imported from BGG, so it has no score to place.
    expect(names(applyFilters(library, withState({ sortKey: 'bgg_rating' })))).toEqual([
      'Pandemic',
      'Gloomhaven',
      'Azul',
    ]);
    expect(
      names(applyFilters(library, withState({ sortKey: 'bgg_rating', sortDirection: 'desc' })))
    ).toEqual(['Gloomhaven', 'Pandemic', 'Azul']);
  });

  it('keeps games with no BGG score last in both directions', () => {
    const asc = applyFilters(library, withState({ sortKey: 'bgg_rating' }));
    const desc = applyFilters(library, withState({ sortKey: 'bgg_rating', sortDirection: 'desc' }));
    expect(asc[asc.length - 1].name).toBe('Azul');
    expect(desc[desc.length - 1].name).toBe('Azul');
  });

  it('sorts by the crowd’s score, not the shelf’s', () => {
    // I gave Gloomhaven 5 and Pandemic 4; BGG has them the same way round here, so flip
    // one to prove the sort reads the game and not my stars.
    const contrary = [
      { ...gloomhaven, bgg_rating: 6.0 },
      { ...pandemic, bgg_rating: 9.0 },
    ];
    const result = applyFilters(contrary, withState({ sortKey: 'bgg_rating', sortDirection: 'desc' }), ratings);
    expect(names(result)).toEqual(['Pandemic', 'Gloomhaven']);
  });

  it('sorts by date added', () => {
    expect(names(applyFilters(library, withState({ sortKey: 'created_at' })))).toEqual([
      'Pandemic',
      'Azul',
      'Gloomhaven',
    ]);
  });

  it('keeps games I have not rated last in both directions', () => {
    // I never scored Azul, so it must never outrank a game I did.
    const asc = applyFilters(library, withState({ sortKey: 'rating', sortDirection: 'asc' }), ratings);
    const desc = applyFilters(library, withState({ sortKey: 'rating', sortDirection: 'desc' }), ratings);
    expect(asc[asc.length - 1].name).toBe('Azul');
    expect(desc[desc.length - 1].name).toBe('Azul');
  });

  it('orders games that are all missing the sort value by name', () => {
    const unrated = [makeGame({ name: 'Zoo' }), makeGame({ name: 'Ark' })];
    expect(names(applyFilters(unrated, withState({ sortKey: 'rating' })))).toEqual(['Ark', 'Zoo']);
  });
});

describe('hearted-by filtering', () => {
  it('returns everything when nobody is selected', () => {
    expect(applyFilters(library, withState({ heartedBy: [] }), ratings)).toHaveLength(3);
  });

  it('keeps only the games that person hearted', () => {
    expect(names(applyFilters(library, withState({ heartedBy: [SAM] }), ratings))).toEqual([
      'Azul',
      'Gloomhaven',
    ]);
  });

  it('a score without a heart is not a heart', () => {
    // Pandemic is the game I scored but never hearted.
    expect(names(applyFilters(library, withState({ heartedBy: [ME] }), ratings))).toEqual([
      'Gloomhaven',
    ]);
  });

  it('"any" reads several people as "or", without duplicating a game they both hearted', () => {
    const result = applyFilters(library, withState({ heartedBy: [ME, SAM] }), ratings);
    expect(names(result)).toEqual(['Azul', 'Gloomhaven']);
  });

  it('"all" keeps only the games everyone selected hearted', () => {
    // Sam hearted Azul and Gloomhaven, I hearted only Gloomhaven: that is the overlap.
    const result = applyFilters(
      library,
      withState({ heartedBy: [ME, SAM], matchMode: 'all' }),
      ratings
    );
    expect(names(result)).toEqual(['Gloomhaven']);
  });

  it('the mode applies to hearts and labels at the same time', () => {
    // 'all' on both: only Gloomhaven is hearted by us both and carries both labels.
    const result = applyFilters(
      library,
      withState({ heartedBy: [ME, SAM], labelIds: [COOP, HEAVY], matchMode: 'all' }),
      ratings
    );
    expect(names(result)).toEqual(['Gloomhaven']);
  });

  it('one person matches the same in either mode', () => {
    const any = applyFilters(library, withState({ heartedBy: [SAM] }), ratings);
    const all = applyFilters(library, withState({ heartedBy: [SAM], matchMode: 'all' }), ratings);
    expect(names(all)).toEqual(names(any));
  });

  it('combines with the label and search filters', () => {
    // Sam hearted Azul and Gloomhaven; only Gloomhaven is heavy.
    const result = applyFilters(library, withState({ heartedBy: [SAM], labelIds: [HEAVY] }), ratings);
    expect(names(result)).toEqual(['Gloomhaven']);
  });

  it('matches nothing for someone who has hearted nothing', () => {
    expect(applyFilters(library, withState({ heartedBy: ['user-nobody'] }), ratings)).toEqual([]);
  });

  it('finds no hearts at all when the ratings have not loaded', () => {
    expect(applyFilters(library, withState({ heartedBy: [SAM] }))).toEqual([]);
  });
});

describe('minimum-star filtering', () => {
  it('returns everything when no threshold is set', () => {
    expect(applyFilters(library, withState({ minStars: null }), ratings)).toHaveLength(3);
  });

  it('keeps games anyone rated at or above the threshold', () => {
    // Gloomhaven 5 (me), Pandemic 4 (me), Azul 3 (Sam).
    expect(names(applyFilters(library, withState({ minStars: 3 }), ratings))).toEqual([
      'Azul',
      'Gloomhaven',
      'Pandemic',
    ]);
    expect(names(applyFilters(library, withState({ minStars: 4 }), ratings))).toEqual([
      'Gloomhaven',
      'Pandemic',
    ]);
    expect(names(applyFilters(library, withState({ minStars: 5 }), ratings))).toEqual([
      'Gloomhaven',
    ]);
  });

  it('takes the best score, not the viewer’s', () => {
    // Sam scored Gloomhaven 1; the 5 from someone else still carries it past every threshold.
    const strangerOnly = indexRatings(ratingRows, null);
    expect(names(applyFilters(library, withState({ minStars: 5 }), strangerOnly))).toEqual([
      'Gloomhaven',
    ]);
  });

  it('drops games nobody has scored', () => {
    const unscored = [makeGame({ name: 'Zoo' })];
    expect(applyFilters(unscored, withState({ minStars: 3 }), ratings)).toEqual([]);
  });

  it('a heart without a score does not clear the bar', () => {
    // Only Sam's stars put Azul over 3; hearts alone say nothing about a score.
    const heartsOnly = indexRatings(
      [rate({ game_id: 'azul', user_id: SAM, hearted: true })],
      ME
    );
    expect(applyFilters(library, withState({ minStars: 3 }), heartsOnly)).toEqual([]);
  });

  it('combines with the label, heart and search filters', () => {
    const result = applyFilters(
      library,
      withState({ minStars: 4, labelIds: [COOP], heartedBy: [ME] }),
      ratings
    );
    expect(names(result)).toEqual(['Gloomhaven']);
  });

  it('finds nothing when the ratings have not loaded', () => {
    expect(applyFilters(library, withState({ minStars: 3 }))).toEqual([]);
  });
});

describe('purity', () => {
  it('does not reorder or mutate the input array', () => {
    const input = [...library];
    applyFilters(input, withState({ sortKey: 'name', sortDirection: 'desc' }));
    expect(names(input)).toEqual(['Gloomhaven', 'Pandemic', 'Azul']);
  });
});
