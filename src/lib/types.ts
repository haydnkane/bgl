export type LibraryRole = 'owner' | 'member';

/** A shelf. Games and labels belong to one, and people are members of it. */
export type Library = {
  id: string;
  name: string;
  /** Null once the creator deletes their account; the shelf outlives them. */
  created_by: string | null;
  /** The shelf a user gets automatically. It cannot be left, only shared. */
  is_personal: boolean;
  created_at: string;
};

/** A library as seen by the signed-in user, carrying their own role on it. */
export type LibraryMembership = {
  library: Library;
  role: LibraryRole;
  joined_at: string;
  /** Counted in the same request, so the header can say "shared" without asking again. */
  member_count: number;
};

/** A fellow member, from list_library_members — emails are not readable directly. */
export type LibraryMember = {
  user_id: string;
  email: string | null;
  role: LibraryRole;
  joined_at: string;
};

export type LibraryInvite = {
  token: string;
  library_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

/** What the holder of an invite link is shown before joining. */
export type InvitePreview = {
  library_id: string;
  library_name: string;
  member_count: number;
  status: 'ok' | 'revoked' | 'expired' | 'already_member';
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
