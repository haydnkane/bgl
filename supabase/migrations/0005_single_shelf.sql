-- One shelf, for everyone.
--
-- The app is a single family collection, so the multi-library model goes away: every game,
-- label and person is collapsed onto one row in `libraries`, and a unique index makes a
-- second one impossible. Shelf creation, switching and leaving are deleted outright.
--
-- Access moves from invite links to an allowlist of usernames (`allowed_users`). Being on
-- the list is what grants membership; removing someone from it revokes their access. The
-- invite tables and functions are dropped.
--
-- `library_id` survives on games and labels even though it can now only hold one value: it
-- is the column every RLS policy is written against, and rewriting those policies would be
-- risk without a user-visible gain.

-- 1. Collapse every shelf into one ----------------------------------------

do $$
declare
  keep uuid;
begin
  -- The busiest shelf wins, so the survivor is the one someone actually filled in. Ties
  -- go to the oldest.
  select l.id into keep
  from public.libraries l
  left join public.games g on g.library_id = l.id
  group by l.id, l.created_at
  order by count(g.id) desc, l.created_at asc
  limit 1;

  if keep is null then
    insert into public.libraries (name, created_by, is_personal)
    values ('Our shelf', null, false)
    returning id into keep;
  end if;

  -- People: one membership each, keeping the strongest role anyone held anywhere and the
  -- date they first joined anything.
  create temp table _members as
  select user_id,
         case when bool_or(role = 'owner') then 'owner' else 'member' end as role,
         min(joined_at) as joined_at
  from public.library_members
  group by user_id;

  delete from public.library_members;
  insert into public.library_members (library_id, user_id, role, joined_at)
  select keep, user_id, role, joined_at from _members;

  -- Labels: "Co-op" from two different shelves has to become one label, because the unique
  -- index on (library_id, lower(name)) is about to see them side by side. The survivor is
  -- whichever one already lived on the surviving shelf, else the oldest.
  create temp table _label_map as
  select id as from_id,
         first_value(id) over (
           partition by lower(name)
           order by (library_id = keep) desc, created_at asc, id asc
         ) as to_id
  from public.labels;

  -- Rebuilt rather than updated in place: remapping label ids can collide with a join row
  -- that already exists, and a plain UPDATE would trip the primary key mid-statement.
  -- array_agg picks a stable "who attached this" from the rows being merged; min() has no
  -- uuid form.
  create temp table _game_labels as
  select gl.game_id,
         m.to_id as label_id,
         (array_agg(gl.user_id order by gl.user_id))[1] as user_id
  from public.game_labels gl
  join _label_map m on m.from_id = gl.label_id
  group by gl.game_id, m.to_id;

  delete from public.game_labels;

  delete from public.labels l
  using _label_map m
  where m.from_id = l.id and m.to_id <> l.id;

  update public.labels set library_id = keep where library_id <> keep;
  update public.games set library_id = keep where library_id <> keep;

  insert into public.game_labels (game_id, label_id, user_id, library_id)
  select game_id, label_id, user_id, keep from _game_labels;

  delete from public.libraries where id <> keep;

  drop table _members;
  drop table _label_map;
  drop table _game_labels;
end $$;

-- 2. Make "one shelf" a rule the database enforces ------------------------
--
-- A single-valued column with a unique index is the plainest way to say "at most one row",
-- and it holds whatever a future function might try.

alter table public.libraries
  add column if not exists singleton boolean not null default true;
alter table public.libraries
  drop constraint if exists libraries_singleton_true;
alter table public.libraries
  add constraint libraries_singleton_true check (singleton);
create unique index if not exists libraries_singleton on public.libraries (singleton);

alter table public.libraries drop column if exists is_personal;

comment on table public.libraries is
  'The shelf. Exactly one row, enforced by libraries_singleton.';

-- Deleting the shelf would take every game with it and leave nothing to sign in to.
drop policy if exists "owners delete their libraries" on public.libraries;

-- Membership is granted and revoked through allowed_users now, so there is no direct
-- delete path: the old "leave, or be removed by an owner" policy would let someone drop
-- themselves off the shelf while staying on the allowlist.
drop policy if exists "leave a library or be removed by an owner" on public.library_members;

-- 3. Retire the multi-shelf and invite APIs -------------------------------

drop function if exists public.ensure_personal_library();
drop function if exists public.create_library(text);
drop function if exists public.leave_library(uuid);
drop function if exists public.create_library_invite(uuid, integer);
drop function if exists public.library_invite_preview(text);
drop function if exists public.redeem_library_invite(text);
drop function if exists public.list_library_members(uuid);
drop table if exists public.library_invites;

-- 4. Membership helpers ---------------------------------------------------
--
-- The existing is_library_member(uuid) stays: every policy on games, labels and game_labels
-- is written against it. These no-argument forms are for the tables that have no
-- library_id of their own, now that "a member" and "a member of the shelf" say the same
-- thing.

create or replace function public.is_shelf_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members where user_id = auth.uid()
  );
$$;

create or replace function public.is_shelf_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members where user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_shelf_member() from public;
revoke all on function public.is_shelf_owner() from public;
grant execute on function public.is_shelf_member() to authenticated;
grant execute on function public.is_shelf_owner() to authenticated;

-- The domain used to turn a username into the email address Supabase Auth insists on.
-- `.invalid` is reserved by RFC 2606 and can never be registered, so these addresses can
-- never collide with a real mailbox. The client holds the same constant in
-- src/lib/username.ts — change both together, or existing accounts stop matching.
create or replace function public.username_domain()
returns text
language sql
immutable
as $$
  select 'shelf.invalid'::text;
$$;

-- How a signed-in account is named on the allowlist: the username for accounts created
-- from one, and the whole address for accounts that predate usernames.
create or replace function public.shelf_username(addr text)
returns text
language sql
immutable
as $$
  select case
    when addr is null then null
    when split_part(lower(addr), '@', 2) = public.username_domain()
      then split_part(lower(addr), '@', 1)
    else lower(addr)
  end;
$$;

-- 5. The allowlist --------------------------------------------------------

create table if not exists public.allowed_users (
  -- Either a username, or an email address for an account made before usernames existed.
  username text primary key check (
    username = lower(username)
    and (
      username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'
      or username ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ),
  -- Optional; the username is what people sign in with either way.
  display_name text,
  added_by uuid references auth.users (id) on delete set null,
  -- Null until that person first signs in. Unique, so one name is one account.
  claimed_by uuid unique references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.allowed_users is
  'Who may use the shelf. Adding a row lets that username in; deleting one revokes access.';

alter table public.allowed_users enable row level security;

drop policy if exists "members read the allowlist" on public.allowed_users;
create policy "members read the allowlist" on public.allowed_users
  for select to authenticated
  using (public.is_shelf_member());

-- Only owners hand out access. `claimed_by` is left to join_shelf(): a client that could
-- set it would be choosing which account a name belongs to.
drop policy if exists "owners add to the allowlist" on public.allowed_users;
create policy "owners add to the allowlist" on public.allowed_users
  for insert to authenticated
  with check (
    public.is_shelf_owner()
    and added_by = auth.uid()
    and claimed_by is null
    and claimed_at is null
  );

-- Removing your own entry would lock you out of the shelf you are standing on.
drop policy if exists "owners remove others from the allowlist" on public.allowed_users;
create policy "owners remove others from the allowlist" on public.allowed_users
  for delete to authenticated
  using (public.is_shelf_owner() and (claimed_by is null or claimed_by <> auth.uid()));

drop policy if exists "owners set a display name" on public.allowed_users;
create policy "owners set a display name" on public.allowed_users
  for update to authenticated
  using (public.is_shelf_owner())
  with check (public.is_shelf_owner());

-- Taking someone off the list has to take away the access they already have, or the list
-- would only govern people who had not signed in yet.
create or replace function public.revoke_access_on_allowlist_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.claimed_by is not null then
    delete from public.library_members where user_id = old.claimed_by;
  end if;
  return old;
end;
$$;

drop trigger if exists allowed_users_revoke_access on public.allowed_users;
create trigger allowed_users_revoke_access
  after delete on public.allowed_users
  for each row execute function public.revoke_access_on_allowlist_delete();

-- 6. Backfill: everyone already on the shelf is allowed to stay -----------

insert into public.allowed_users (username, claimed_by, claimed_at, created_at)
select distinct on (public.shelf_username(u.email))
       public.shelf_username(u.email), m.user_id, m.joined_at, m.joined_at
from public.library_members m
join auth.users u on u.id = m.user_id
where u.email is not null
order by public.shelf_username(u.email), m.joined_at
on conflict (username) do nothing;

-- Somebody has to be able to manage the allowlist. If the collapse left no owner — every
-- shelf was joined rather than created — the longest-standing member is promoted.
update public.library_members
set role = 'owner'
where user_id = (
  select user_id from public.library_members order by joined_at, user_id limit 1
)
and not exists (select 1 from public.library_members where role = 'owner');

-- 7. Joining ---------------------------------------------------------------

-- Called by the client after every sign-in. Idempotent, and the only way onto the shelf:
-- there is no insert policy on library_members at all.
create or replace function public.join_shelf()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  uname text;
  entry public.allowed_users;
  lib uuid;
begin
  if uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select public.shelf_username(u.email) into uname from auth.users u where u.id = uid;
  if uname is null then
    raise exception 'That account has no sign-in name.' using errcode = '42501';
  end if;

  select id into lib from public.libraries limit 1;
  if lib is null then
    raise exception 'The shelf has not been set up yet.';
  end if;

  -- Bootstrap. On a brand new deployment the shelf has no members, so there is nobody who
  -- could have put the first person on the allowlist: the first account to sign in takes
  -- it, as its owner. Once anyone is on the shelf this branch can never run again.
  if not exists (select 1 from public.library_members) then
    insert into public.allowed_users (username, claimed_by, claimed_at)
    values (uname, uid, now())
    on conflict (username) do update set claimed_by = uid, claimed_at = now();

    insert into public.library_members (library_id, user_id, role)
    values (lib, uid, 'owner')
    on conflict (library_id, user_id) do update set role = 'owner';

    return lib;
  end if;

  select * into entry from public.allowed_users where username = uname;
  if not found then
    raise exception '"%" is not on the shelf yet. Ask someone already on it to add you.', uname
      using errcode = '42501';
  end if;
  if entry.claimed_by is not null and entry.claimed_by <> uid then
    raise exception '"%" is already in use by another account.', uname using errcode = '42501';
  end if;

  if entry.claimed_by is null then
    update public.allowed_users
    set claimed_by = uid, claimed_at = now()
    where username = uname;
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (lib, uid, 'member')
  on conflict (library_id, user_id) do nothing;

  return lib;
end;
$$;

-- The people screen: the allowlist, plus whether each name has been signed into yet.
-- Definer only so the membership check reads like every other function here; both tables
-- are readable by members anyway.
create or replace function public.list_shelf_people()
returns table (
  username text,
  display_name text,
  user_id uuid,
  role text,
  joined_at timestamptz,
  added_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_shelf_member() then
    raise exception 'You are not on the shelf.' using errcode = '42501';
  end if;

  return query
    select a.username, a.display_name, a.claimed_by, m.role, m.joined_at, a.created_at
    from public.allowed_users a
    left join public.library_members m on m.user_id = a.claimed_by
    order by (a.claimed_by is null), a.created_at, a.username;
end;
$$;

revoke all on function public.username_domain() from public;
revoke all on function public.shelf_username(text) from public;
revoke all on function public.join_shelf() from public;
revoke all on function public.list_shelf_people() from public;

grant execute on function public.username_domain() to anon, authenticated;
grant execute on function public.join_shelf() to authenticated;
grant execute on function public.list_shelf_people() to authenticated;
