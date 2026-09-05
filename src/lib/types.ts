/**
 * What someone may do.
 *
 *   owner   everything, including managing people and their roles
 *   admin   adds, edits and deletes games and labels
 *   member  read only — search and filter
 *
 * Enforced by row level security, not by the UI; see 0006_member_roles.sql.
 */
export type LibraryRole = 'owner' | 'admin' | 'member';

export const ROLE_LABELS: Record<LibraryRole, string> = {
  owner: 'Owner',
  admin: 'Can edit',
  member: 'View only',
};

/** What each role is allowed to do, in the words the settings screen uses. */
export const ROLE_HINTS: Record<LibraryRole, string> = {
  owner: 'Everything, including managing people',
  admin: 'Add, edit and delete games and labels',
  member: 'Search and browse only',
};

/**
 * The signed-in user's place in the collection.
 *
 * There is only ever one library, so this carries its id — which every game and label row
 * is scoped to — rather than the row itself. Nothing in the app displays the library.
 */
export type LibraryMembership = {
  library_id: string;
  role: LibraryRole;
  joined_at: string;
};

/**
 * A row of the allowlist, from list_shelf_people().
 *
 * Everything below `username` is null until that person first signs in: the entry is
 * permission to use the shelf, granted before the account it will belong to exists.
 */
export type ShelfPerson = {
  username: string;
  display_name: string | null;
  /** Null until they first sign in; the role applies from the moment they are added. */
  user_id: string | null;
  role: LibraryRole;
  joined_at: string | null;
  added_at: string;
};

export type Label = {
  id: string;
  library_id: string;
  /** Who created it. Membership, not this, decides who may change it. */
  user_id: string | null;
  name: string;
  color: string;
  created_at: string;
};

export type Game = {
  id: string;
  library_id: string;
  /** Who added it. Membership, not this, decides who may change it. */
  user_id: string | null;
  name: string;
  bgg_id: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  year_published: number | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
  /**
   * BoardGameGeek's community average out of 10, cached when the game was imported or
   * refreshed. Nothing to do with {@link GameRating}, which is what this shelf thinks.
   */
  bgg_rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** A game plus the ids of the labels attached to it. */
export type GameWithLabels = Game & { labelIds: string[] };

/** Fields the user (or a BGG import) can supply when creating or editing a game. */
export type GameInput = {
  name: string;
  bgg_id?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  year_published?: number | null;
  min_players?: number | null;
  max_players?: number | null;
  playing_time?: number | null;
  bgg_rating?: number | null;
  notes?: string | null;
};

/**
 * One person's opinion of one game.
 *
 * Ratings are personal, not a property of the game: everyone on the shelf keeps their own
 * row, and everyone can see everyone else's. A row exists only while there is something to
 * say — clearing both the stars and the heart deletes it.
 */
export type GameRating = {
  game_id: string;
  user_id: string;
  /** 1-5, or null when they have hearted it without scoring it. */
  stars: number | null;
  hearted: boolean;
};
