-- BoardGameGeek's community score, cached on the game.
--
-- Not to be confused with `game_ratings`, which holds what people on *this* shelf think.
-- This is the crowd's average out of ten, copied from BGG when a game is imported or
-- refreshed. It is a snapshot, not a live value: BGG's average drifts as people vote, and
-- the shelf only catches up when someone taps "Refresh from BoardGameGeek".
--
-- Nobody edits it by hand, so there is no write policy of its own — it rides along with
-- the games table, which already restricts writes to editors.

alter table public.games
  add column if not exists bgg_rating numeric(4, 2)
    check (bgg_rating is null or bgg_rating between 0 and 10);

comment on column public.games.bgg_rating is
  'BoardGameGeek community average out of 10, cached at import/refresh. Null for games never imported from BGG.';
