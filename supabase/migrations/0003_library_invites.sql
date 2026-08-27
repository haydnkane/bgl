-- The membership API.
--
-- Creating a library, joining one, and listing who is on it all run as security definer
-- functions rather than as table writes. That is what lets a stranger holding an invite
-- token add themselves to a library they cannot yet see, without also being able to add
-- themselves to any *other* library — there is no insert policy on library_members at all,
-- so redeem_library_invite() is the only door.
--
-- Each function is `set search_path = ''`, so every reference is schema qualified.

-- The caller's personal shelf, created on demand. Called once per sign-in by the client:
-- a user who has never opened the app has no library yet, and a user who has left every
-- shared library needs somewhere to land.
create or replace function public.ensure_personal_library()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
begin
  if uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select id into lib from public.libraries where created_by = uid and is_personal;

  if lib is null then
    -- Two devices signing in at once would otherwise create two personal shelves; the
    -- partial unique index makes the loser of that race a no-op.
    insert into public.libraries (name, created_by, is_personal)
    values ('My shelf', uid, true)
    on conflict (created_by) where is_personal do nothing;

    select id into lib from public.libraries where created_by = uid and is_personal;
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (lib, uid, 'owner')
  on conflict (library_id, user_id) do nothing;

  return lib;
end;
$$;

-- An additional shared shelf, e.g. "Game night at Sam's".
create or replace function public.create_library(name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lib uuid;
begin
  if uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if name is null or length(trim(name)) = 0 then
    raise exception 'A shelf needs a name.';
  end if;

  insert into public.libraries (name, created_by)
  values (trim(name), uid)
  returning id into lib;

  insert into public.library_members (library_id, user_id, role)
  values (lib, uid, 'owner');

  return lib;
end;
$$;

-- Mints an invite token. Any member can invite; `ttl_hours` null means the link never
-- expires, which is the right default for "here is our shelf" but is why revoking exists.
create or replace function public.create_library_invite(lib uuid, ttl_hours integer default 168)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if not public.is_library_member(lib) then
    raise exception 'You are not a member of that shelf.' using errcode = '42501';
  end if;

  tok := replace(gen_random_uuid()::text, '-', '');

  insert into public.library_invites (token, library_id, created_by, expires_at)
  values (
    tok,
    lib,
    uid,
    case when ttl_hours is null then null else now() + make_interval(hours => ttl_hours) end
  );

  return tok;
end;
$$;

-- What the recipient of a link is shown *before* joining, and before signing in — hence
-- executable by anon. It deliberately reveals only the shelf's name and size: enough to
-- decide whether the link is genuine, and nothing about its contents.
--
-- Returns no rows for a token that does not exist, so an attacker guessing tokens learns
-- nothing beyond "no".
create or replace function public.library_invite_preview(tok text)
returns table (library_id uuid, library_name text, member_count integer, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.library_id,
    l.name,
    (select count(*) from public.library_members m where m.library_id = i.library_id)::integer,
    case
      when i.revoked_at is not null then 'revoked'
      when i.expires_at is not null and i.expires_at < now() then 'expired'
      when auth.uid() is not null and exists (
        select 1 from public.library_members m
        where m.library_id = i.library_id and m.user_id = auth.uid()
      ) then 'already_member'
      else 'ok'
    end
  from public.library_invites i
  join public.libraries l on l.id = i.library_id
  where i.token = tok;
$$;

-- Redeeming is idempotent: following the same link twice just returns the library.
create or replace function public.redeem_library_invite(tok text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.library_invites;
begin
  if uid is null then
    raise exception 'You must be signed in to join a shelf.' using errcode = '28000';
  end if;

  select * into inv from public.library_invites where token = tok;

  if not found then
    raise exception 'That invite link is not valid.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invite link has been revoked.';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'That invite link has expired.';
  end if;

  insert into public.library_members (library_id, user_id, role)
  values (inv.library_id, uid, 'member')
  on conflict (library_id, user_id) do nothing;

  return inv.library_id;
end;
$$;

-- Members can see who else is on a shelf. Emails live in auth.users, which clients cannot
-- read, so they come back through here — visible only to fellow members of that shelf.
create or replace function public.list_library_members(lib uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_library_member(lib) then
    raise exception 'You are not a member of that shelf.' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.joined_at
    from public.library_members m
    join auth.users u on u.id = m.user_id
    where m.library_id = lib
    order by m.joined_at;
end;
$$;

-- Leaving is a plain delete under RLS, except for one case the policy cannot express: the
-- last owner walking away would strand the shelf with no one able to manage it, so the
-- longest-standing remaining member is promoted.
create or replace function public.leave_library(lib uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  if not public.is_library_member(lib) then
    raise exception 'You are not a member of that shelf.' using errcode = '42501';
  end if;

  select count(*) into remaining
  from public.library_members where library_id = lib and user_id <> uid;

  if remaining = 0 then
    raise exception 'You are the only member of that shelf, so there is no one to leave it to.';
  end if;

  delete from public.library_members where library_id = lib and user_id = uid;

  if not exists (
    select 1 from public.library_members where library_id = lib and role = 'owner'
  ) then
    update public.library_members
    set role = 'owner'
    where library_id = lib
      and user_id = (
        select user_id from public.library_members
        where library_id = lib order by joined_at limit 1
      );
  end if;
end;
$$;

revoke all on function public.ensure_personal_library() from public;
revoke all on function public.create_library(text) from public;
revoke all on function public.create_library_invite(uuid, integer) from public;
revoke all on function public.library_invite_preview(text) from public;
revoke all on function public.redeem_library_invite(text) from public;
revoke all on function public.list_library_members(uuid) from public;
revoke all on function public.leave_library(uuid) from public;

grant execute on function public.ensure_personal_library() to authenticated;
grant execute on function public.create_library(text) to authenticated;
grant execute on function public.create_library_invite(uuid, integer) to authenticated;
grant execute on function public.redeem_library_invite(text) to authenticated;
grant execute on function public.list_library_members(uuid) to authenticated;
grant execute on function public.leave_library(uuid) to authenticated;

-- The only one a signed-out visitor may call: it is what renders the join screen.
grant execute on function public.library_invite_preview(text) to anon, authenticated;
