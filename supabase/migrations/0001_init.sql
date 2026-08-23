-- Board Game Shelf: schema, indexes and row-level security.
-- Every table is scoped to the signed-in user; RLS is the only thing protecting the
-- data, since the anon key ships inside the web bundle by design.

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null default '#7C7F86',
  created_at timestamptz not null default now()
);

-- One "Co-op" per user, regardless of how it was capitalised.
create unique index if not exists labels_user_name_unique
  on public.labels (user_id, lower(name));

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  bgg_id integer,
  image_url text,
  thumbnail_url text,
  year_published integer,
  min_players integer,
  max_players integer,
  playing_time integer,
  rating integer check (rating is null or rating between 1 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_user_name_idx on public.games (user_id, name);

create table if not exists public.game_labels (
  game_id uuid not null references public.games (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  -- Denormalised so the RLS policy is a plain column check with no join.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (game_id, label_id)
);

create index if not exists game_labels_label_idx on public.game_labels (label_id);
create index if not exists game_labels_game_idx on public.game_labels (game_id);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- Row level security ------------------------------------------------------

alter table public.labels enable row level security;
alter table public.games enable row level security;
alter table public.game_labels enable row level security;

drop policy if exists "labels are private" on public.labels;
create policy "labels are private" on public.labels
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "games are private" on public.games;
create policy "games are private" on public.games
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "game labels are private" on public.game_labels;
create policy "game labels are private" on public.game_labels
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
