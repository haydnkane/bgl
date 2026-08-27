-- Shared libraries.
--
-- A *library* is now the unit of ownership: games and labels belong to a library, and a
-- library has members. Everything that used to be scoped to `user_id = auth.uid()` is
-- scoped to "the caller is a member of this library" instead.
--
-- Users are linked to a library by redeeming an *invite token* — a secret string that goes
-- into a URL (/join/<token>). Redeeming happens in a security definer function, so nobody
-- can insert themselves into a library by writing to `library_members` directly.
--
-- `user_id` survives on games and labels, but its meaning changes from "owner" to "who
-- added this". It is therefore nullable now, and no longer cascades a delete.

-- 1. Tables ---------------------------------------------------------------

create table if not exists public.libraries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Null once the creator deletes their account: the library outlives them for the
  -- other members.
  created_by uuid references auth.users (id) on delete set null,
  -- The shelf every user gets on first sign-in. One per person, enforced below.
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists libraries_one_personal_per_user
  on public.libraries (created_by) where is_personal;

create table if not exists public.library_members (
  library_id uuid not null references public.libraries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

-- "Which libraries am I in?" is the query behind every screen.
create index if not exists library_members_user_idx on public.library_members (user_id);

create table if not exists public.library_invites (
  -- 32 hex characters from gen_random_uuid(): 122 bits of randomness, and the only thing
  -- standing between a stranger and the library, so it is shown only to members.
  token text primary key,
  library_id uuid not null references public.libraries (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Null means "never expires".
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists library_invites_library_idx on public.library_invites (library_id);

-- 2. Membership helpers ---------------------------------------------------
--
-- These are security definer because the RLS policy on `library_members` would otherwise
-- have to read `library_members`, which recurses. Definer breaks the cycle: the function
-- runs as its owner, so RLS does not apply inside it.

create or replace function public.is_library_member(lib uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members
    where library_id = lib and user_id = auth.uid()
  );
$$;

create or replace function public.is_library_owner(lib uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members
    where library_id = lib and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_library_member(uuid) from public;
revoke all on function public.is_library_owner(uuid) from public;
grant execute on function public.is_library_member(uuid) to authenticated;
grant execute on function public.is_library_owner(uuid) to authenticated;

-- 3. Backfill -------------------------------------------------------------
-- Every existing user gets a personal library, and their rows move into it.

insert into public.libraries (name, created_by, is_personal)
select 'My shelf', u.id, true
from auth.users u
where not exists (
  select 1 from public.libraries l where l.created_by = u.id and l.is_personal
);

insert into public.library_members (library_id, user_id, role)
select l.id, l.created_by, 'owner'
from public.libraries l
where l.is_personal and l.created_by is not null
on conflict (library_id, user_id) do nothing;

alter table public.games add column if not exists library_id uuid
  references public.libraries (id) on delete cascade;
alter table public.labels add column if not exists library_id uuid
  references public.libraries (id) on delete cascade;
alter table public.game_labels add column if not exists library_id uuid
  references public.libraries (id) on delete cascade;

update public.games g set library_id = l.id
  from public.libraries l
  where l.created_by = g.user_id and l.is_personal and g.library_id is null;
update public.labels x set library_id = l.id
  from public.libraries l
  where l.created_by = x.user_id and l.is_personal and x.library_id is null;
update public.game_labels gl set library_id = l.id
  from public.libraries l
  where l.created_by = gl.user_id and l.is_personal and gl.library_id is null;

alter table public.games alter column library_id set not null;
alter table public.labels alter column library_id set not null;
alter table public.game_labels alter column library_id set not null;

-- `user_id` now records who added the row, not who owns it. Deleting an account must not
-- delete games the other members still rely on.
alter table public.games alter column user_id drop not null;
alter table public.labels alter column user_id drop not null;
alter table public.game_labels alter column user_id drop not null;

alter table public.games drop constraint if exists games_user_id_fkey;
alter table public.games add constraint games_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.labels drop constraint if exists labels_user_id_fkey;
alter table public.labels add constraint labels_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.game_labels drop constraint if exists game_labels_user_id_fkey;
alter table public.game_labels add constraint game_labels_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

comment on column public.games.user_id is
  'Who added this game. Not an ownership check — see library_members.';
comment on column public.labels.user_id is
  'Who created this label. Not an ownership check — see library_members.';
comment on column public.game_labels.user_id is
  'Who attached this label. Not an ownership check — see library_members.';

-- Uniqueness and lookups follow the library, not the user: one "Co-op" per shelf, however
-- many people are on it.
drop index if exists public.labels_user_name_unique;
create unique index if not exists labels_library_name_unique
  on public.labels (library_id, lower(name));

drop index if exists public.games_user_name_idx;
create index if not exists games_library_name_idx on public.games (library_id, name);
create index if not exists labels_library_idx on public.labels (library_id);
create index if not exists game_labels_library_idx on public.game_labels (library_id);

-- 4. Row level security ---------------------------------------------------

alter table public.libraries enable row level security;
alter table public.library_members enable row level security;
alter table public.library_invites enable row level security;

-- Libraries are created only through create_library() / ensure_personal_library(), so
-- there is deliberately no insert policy here: a client cannot conjure one, and would not
-- be able to read back the row it inserted anyway.
drop policy if exists "members read their libraries" on public.libraries;
create policy "members read their libraries" on public.libraries
  for select to authenticated
  using (public.is_library_member(id));

drop policy if exists "owners rename their libraries" on public.libraries;
create policy "owners rename their libraries" on public.libraries
  for update to authenticated
  using (public.is_library_owner(id))
  with check (public.is_library_owner(id));

drop policy if exists "owners delete their libraries" on public.libraries;
create policy "owners delete their libraries" on public.libraries
  for delete to authenticated
  using (public.is_library_owner(id));

drop policy if exists "members see fellow members" on public.library_members;
create policy "members see fellow members" on public.library_members
  for select to authenticated
  using (public.is_library_member(library_id));

-- Joining is redeem_library_invite()'s job — hence no insert policy. Removal is either
-- leaving (yourself) or an owner removing someone.
drop policy if exists "leave a library or be removed by an owner" on public.library_members;
create policy "leave a library or be removed by an owner" on public.library_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_library_owner(library_id));

drop policy if exists "owners change roles" on public.library_members;
create policy "owners change roles" on public.library_members
  for update to authenticated
  using (public.is_library_owner(library_id))
  with check (public.is_library_owner(library_id));

-- Invites are created by create_library_invite(); members can list and revoke them.
drop policy if exists "members see their library invites" on public.library_invites;
create policy "members see their library invites" on public.library_invites
  for select to authenticated
  using (public.is_library_member(library_id));

drop policy if exists "members revoke invites" on public.library_invites;
create policy "members revoke invites" on public.library_invites
  for update to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

drop policy if exists "members delete invites" on public.library_invites;
create policy "members delete invites" on public.library_invites
  for delete to authenticated
  using (public.is_library_member(library_id));

drop policy if exists "games are private" on public.games;
drop policy if exists "library members use games" on public.games;
create policy "library members use games" on public.games
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

drop policy if exists "labels are private" on public.labels;
drop policy if exists "library members use labels" on public.labels;
create policy "library members use labels" on public.labels
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (public.is_library_member(library_id));

-- The `with check` also closes the hole the old denormalised policy left open: a member of
-- one library could point a join row at another library's game. Both sides must now live
-- in the same library as the join row itself. The columns are qualified because an
-- unqualified `library_id` inside the subquery would bind to the subquery's own table.
drop policy if exists "game labels are private" on public.game_labels;
drop policy if exists "library members use game labels" on public.game_labels;
create policy "library members use game labels" on public.game_labels
  for all to authenticated
  using (public.is_library_member(library_id))
  with check (
    public.is_library_member(library_id)
    and exists (
      select 1 from public.games g
      where g.id = game_labels.game_id and g.library_id = game_labels.library_id
    )
    and exists (
      select 1 from public.labels l
      where l.id = game_labels.label_id and l.library_id = game_labels.library_id
    )
  );
