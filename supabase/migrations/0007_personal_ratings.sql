-- Ratings belong to people, not to the shelf.
--
-- `games.rating` was one number for the whole collection: whoever edited the game last
-- decided what everyone saw. A shared shelf wants the opposite — five stars each, plus a
-- heart for "this one is mine", and everyone can see what everyone else thought.
--
-- Rating is deliberately not an editor's privilege. A view-only member may score and heart
-- any game; what they may not do is change the game itself. That is why the write policies
-- below ask `user_id = auth.uid()` and never `is_shelf_editor()`.

-- 1. The table -------------------------------------------------------------

create table if not exists public.game_ratings (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Denormalised so the RLS policies are the same plain column check used everywhere else.
  library_id uuid not null references public.libraries (id) on delete cascade,
  -- Null when they have only hearted it. Out of five, not ten: the page shows five stars.
  stars smallint check (stars is null or stars between 1 and 5),
  hearted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id),
  -- No score and no heart is not an opinion. Clearing both deletes the row, so "has this
  -- person rated it" stays the same question as "is there a row".
  constraint game_ratings_not_empty check (stars is not null or hearted)
);

comment on table public.game_ratings is
  'One person''s opinion of one game. Any member may write their own row, view-only included.';

-- The client reads every rating on the shelf in one request and indexes them in memory,
-- the same way it does games and labels.
create index if not exists game_ratings_library_idx on public.game_ratings (library_id);
create index if not exists game_ratings_user_idx on public.game_ratings (user_id);

drop trigger if exists game_ratings_set_updated_at on public.game_ratings;
create trigger game_ratings_set_updated_at
  before update on public.game_ratings
  for each row execute function public.set_updated_at();

-- 2. Row level security -----------------------------------------------------

alter table public.game_ratings enable row level security;

-- Everyone on the shelf sees everyone's scores; that is the point of showing them.
drop policy if exists "members read ratings" on public.game_ratings;
create policy "members read ratings" on public.game_ratings
  for select to authenticated
  using (public.is_library_member(library_id));

-- The game guard mirrors game_labels: a rating may not point at a game on another shelf.
-- Columns are qualified because an unqualified `library_id` would bind to the subquery.
drop policy if exists "members rate for themselves" on public.game_ratings;
create policy "members rate for themselves" on public.game_ratings
  for insert to authenticated
  with check (
    public.is_library_member(library_id)
    and user_id = auth.uid()
    and exists (
      select 1 from public.games g
      where g.id = game_ratings.game_id and g.library_id = game_ratings.library_id
    )
  );

drop policy if exists "members change their own rating" on public.game_ratings;
create policy "members change their own rating" on public.game_ratings
  for update to authenticated
  using (public.is_library_member(library_id) and user_id = auth.uid())
  with check (
    public.is_library_member(library_id)
    and user_id = auth.uid()
    and exists (
      select 1 from public.games g
      where g.id = game_ratings.game_id and g.library_id = game_ratings.library_id
    )
  );

drop policy if exists "members clear their own rating" on public.game_ratings;
create policy "members clear their own rating" on public.game_ratings
  for delete to authenticated
  using (public.is_library_member(library_id) and user_id = auth.uid());

-- 3. Carry the old column over ----------------------------------------------
--
-- The single shared rating becomes the personal rating of whoever added the game — they
-- are the only person it can honestly be attributed to. 1-10 halves into 1-5, rounding up
-- so a 1 stays a star rather than disappearing. Games added by someone since removed from
-- the shelf lose their score; there is nobody left to own it.

insert into public.game_ratings (game_id, user_id, library_id, stars, hearted)
select g.id, g.user_id, g.library_id, greatest(1, least(5, ceil(g.rating / 2.0)))::smallint, false
from public.games g
where g.rating is not null
  and g.user_id is not null
  and exists (select 1 from public.library_members m where m.user_id = g.user_id)
on conflict (game_id, user_id) do nothing;

alter table public.games drop column if exists rating;
