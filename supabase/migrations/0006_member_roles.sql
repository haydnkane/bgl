-- Three roles.
--
--   owner   everything, including who is on the list and what each of them may do
--   admin   adds, edits and deletes games and labels; cannot manage people
--   member  read only — search and filter, nothing else
--
-- The distinction lives in the row level security policies, not only in the UI. The anon
-- key ships inside the web bundle by design, so a member who opened a console could
-- otherwise write straight to the REST API. Hiding a button is a courtesy; the policy is
-- the rule.
--
-- `allowed_users.role` is the single source of truth, so a role can be set before that
-- person has ever signed in. `library_members.role` mirrors it, because that is the column
-- the policy helpers read; set_person_role() is the only thing that writes either.

-- 1. Widen both role constraints ------------------------------------------

alter table public.library_members drop constraint if exists library_members_role_check;
alter table public.library_members add constraint library_members_role_check
  check (role in ('owner', 'admin', 'member'));

alter table public.allowed_users add column if not exists role text not null default 'member';
alter table public.allowed_users drop constraint if exists allowed_users_role_check;
alter table public.allowed_users add constraint allowed_users_role_check
  check (role in ('owner', 'admin', 'member'));

-- 2. Backfill --------------------------------------------------------------
--
-- Everyone who is on the shelf today can add and edit games; 'member' used to mean exactly
-- that. Leaving them as 'member' would silently take that away, so they become admins and
-- keep what they had. Read-only is a choice someone now has to make deliberately.

update public.library_members set role = 'admin' where role = 'member';

update public.allowed_users a
set role = coalesce(
  (select m.role from public.library_members m where m.user_id = a.claimed_by),
  -- Entries added before roles existed were an invitation to help, not to watch.
  'admin'
);

-- 3. Who may write ---------------------------------------------------------

create or replace function public.is_shelf_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.library_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_shelf_editor() from public;
grant execute on function public.is_shelf_editor() to authenticated;

-- 4. Split read from write on the content tables ---------------------------
--
-- These were single `for all` policies. Reading stays open to everyone on the shelf;
-- every way of changing a row now also asks whether the caller may write at all.

drop policy if exists "library members use games" on public.games;

drop policy if exists "members read games" on public.games;
create policy "members read games" on public.games
  for select to authenticated
  using (public.is_library_member(library_id));

drop policy if exists "editors add games" on public.games;
create policy "editors add games" on public.games
  for insert to authenticated
  with check (public.is_library_member(library_id) and public.is_shelf_editor());

drop policy if exists "editors change games" on public.games;
create policy "editors change games" on public.games
  for update to authenticated
  using (public.is_library_member(library_id) and public.is_shelf_editor())
  with check (public.is_library_member(library_id) and public.is_shelf_editor());

drop policy if exists "editors delete games" on public.games;
create policy "editors delete games" on public.games
  for delete to authenticated
  using (public.is_library_member(library_id) and public.is_shelf_editor());

drop policy if exists "library members use labels" on public.labels;

drop policy if exists "members read labels" on public.labels;
create policy "members read labels" on public.labels
  for select to authenticated
  using (public.is_library_member(library_id));

drop policy if exists "editors add labels" on public.labels;
create policy "editors add labels" on public.labels
  for insert to authenticated
  with check (public.is_library_member(library_id) and public.is_shelf_editor());

drop policy if exists "editors change labels" on public.labels;
create policy "editors change labels" on public.labels
  for update to authenticated
  using (public.is_library_member(library_id) and public.is_shelf_editor())
  with check (public.is_library_member(library_id) and public.is_shelf_editor());

drop policy if exists "editors delete labels" on public.labels;
create policy "editors delete labels" on public.labels
  for delete to authenticated
  using (public.is_library_member(library_id) and public.is_shelf_editor());

-- The join table keeps the cross-library guard from 0002: both ends of a join row must
-- live in the same library as the row itself. The columns are qualified because an
-- unqualified `library_id` inside the subquery would bind to the subquery's own table.
drop policy if exists "library members use game labels" on public.game_labels;

drop policy if exists "members read game labels" on public.game_labels;
create policy "members read game labels" on public.game_labels
  for select to authenticated
  using (public.is_library_member(library_id));

drop policy if exists "editors add game labels" on public.game_labels;
create policy "editors add game labels" on public.game_labels
  for insert to authenticated
  with check (
    public.is_library_member(library_id)
    and public.is_shelf_editor()
    and exists (
      select 1 from public.games g
      where g.id = game_labels.game_id and g.library_id = game_labels.library_id
    )
    and exists (
      select 1 from public.labels l
      where l.id = game_labels.label_id and l.library_id = game_labels.library_id
    )
  );

drop policy if exists "editors delete game labels" on public.game_labels;
create policy "editors delete game labels" on public.game_labels
  for delete to authenticated
  using (public.is_library_member(library_id) and public.is_shelf_editor());

-- 5. Setting and changing roles --------------------------------------------

-- Roles are set through this function alone, so the two copies cannot drift. Dropping the
-- blanket update policy is what closes the other door.
drop policy if exists "owners set a display name" on public.allowed_users;

create or replace function public.set_person_role(uname text, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  target public.allowed_users;
begin
  if not public.is_shelf_owner() then
    raise exception 'Only an owner can change what someone may do.' using errcode = '42501';
  end if;
  if new_role not in ('owner', 'admin', 'member') then
    raise exception 'Unknown role "%".', new_role;
  end if;

  select * into target from public.allowed_users where username = uname;
  if not found then
    raise exception '"%" is not on the list.', uname;
  end if;

  -- The last owner demoting themselves would leave nobody able to manage anyone, and
  -- nobody able to undo it. Same reasoning as not being able to remove your own entry.
  if target.claimed_by is not distinct from uid then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  update public.allowed_users set role = new_role where username = uname;

  if target.claimed_by is not null then
    update public.library_members set role = new_role where user_id = target.claimed_by;
  end if;
end;
$$;

-- 6. Joining picks up the role chosen when the person was added ------------

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

  -- Bootstrap. On a brand new deployment nobody is on the list, so there is nobody who
  -- could have added the first person: the first account to sign in takes it, as owner.
  -- Once anyone is a member this branch can never run again.
  if not exists (select 1 from public.library_members) then
    insert into public.allowed_users (username, role, claimed_by, claimed_at)
    values (uname, 'owner', uid, now())
    on conflict (username)
      do update set role = 'owner', claimed_by = uid, claimed_at = now();

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

  -- The role the owner chose when adding them. On a repeat call the mirror is refreshed,
  -- so a role changed while they were signed out takes effect on their next load.
  insert into public.library_members (library_id, user_id, role)
  values (lib, uid, entry.role)
  on conflict (library_id, user_id) do update set role = entry.role;

  return lib;
end;
$$;

-- 7. The people list reports the role, whether or not they have signed in --

drop function if exists public.list_shelf_people();

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
    select a.username, a.display_name, a.claimed_by, a.role, m.joined_at, a.created_at
    from public.allowed_users a
    left join public.library_members m on m.user_id = a.claimed_by
    order by
      case a.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      a.created_at,
      a.username;
end;
$$;

revoke all on function public.set_person_role(text, text) from public;
revoke all on function public.list_shelf_people() from public;
grant execute on function public.set_person_role(text, text) to authenticated;
grant execute on function public.list_shelf_people() to authenticated;
