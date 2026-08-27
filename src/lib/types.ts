export type LibraryRole = 'owner' | 'member';

/** The shelf. There is exactly one, and every game and label belongs to it. */
export type Library = {
  id: string;
  name: string;
  created_at: string;
};

/** The shelf as seen by the signed-in user, carrying their own role on it. */
export type LibraryMembership = {
  library: Library;
  role: LibraryRole;
  joined_at: string;
  /** Counted in the same request, so the header can show it without asking again. */
  member_count: number;
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
  user_id: string | null;
  role: LibraryRole | null;
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
  rating: number | null;
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
  rating?: number | null;
  notes?: string | null;
};
