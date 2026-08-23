export type Label = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Game = {
  id: string;
  user_id: string;
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
