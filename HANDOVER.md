# Handover

Status as of 2026-08-25. Written for whoever (or whatever) picks this up next.

**One-line summary:** the app is live against a real Supabase project and has been driven end to end
in a real browser — 24/24 checks green, covering sign-in, BGG import, labels, search, filter, sort,
edit and delete. One user-facing defect was found and fixed; one low-severity RLS gap is left open
deliberately. Android has still never been run.

The previous version of this file said "THE BLOCKER: no Supabase project exists". That is resolved.

---

## What this is

A personal board game collection tracker for `usefulcat@gmail.com`, running in the browser and as an
Android app from one Expo codebase. Requested features, all implemented and now verified on web:

- maintain a library of games
- add, edit, remove
- link to BoardGameGeek for images
- add labels to games
- search by name, filter and sort by labels

## Stack and layout

Expo SDK 57 (React Native 0.86, React 19.2), TypeScript, expo-router, react-native-web,
Supabase (Postgres + Auth + Edge Functions), TanStack Query.

```
src/
  app/                  routes (expo-router, file-based)
    _layout.tsx         QueryClientProvider + AuthProvider + auth redirect gate
    sign-in.tsx         email/password
    (tabs)/index.tsx    library: search, label filter, sort, FAB to add
    (tabs)/labels.tsx   manage labels
    game/new.tsx        add — "Search BGG" tab or "Enter manually" tab
    game/[id].tsx       detail, edit, delete, "Refresh from BGG"
  components/           GameCard, GameForm, LabelPicker, LabelChip, SearchBar,
                        FilterSortBar, Button, Field, EmptyState, Themed{Text,View}
  lib/
    supabase.ts         client; platform-aware auth storage
    auth.tsx            AuthProvider / useAuth / signOut
    filter.ts           pure search/filter/sort — unit tested in filter.test.ts
    bgg.ts              typed client for the edge function
    queries/games.ts    useGames, useGame, useAddGame, useUpdateGame, useDeleteGame
    queries/labels.ts   label CRUD
  hooks/use-persistent-filter.ts   filter/sort choices survive reload (AsyncStorage)
supabase/
  migrations/0001_init.sql   schema, indexes, updated_at trigger, RLS policies
  functions/bgg/index.ts     BoardGameGeek proxy (Deno)
```

Notes for editing:
- The SDK 57 template puts routes under **`src/app`**, not `app/`. The `@/*` alias maps to `./src/*`.
- `tsconfig.json` **excludes `supabase/`** — that's Deno code with its own globals; the app compiler
  must not typecheck it.
- `AGENTS.md` says to read https://docs.expo.dev/versions/v57.0.0/ before writing code. Worth
  honouring — SDK 57 moved things.

---

## Live configuration

Supabase project ref **`blrqoobsbjbqmnwebaho`** (`https://blrqoobsbjbqmnwebaho.supabase.co`).

| Thing | State |
|---|---|
| `.env.local` | Real project URL + publishable key. Gitignored. Keep it that way. |
| `0001_init.sql` | Applied. All three tables exist, every column matches the migration. |
| RLS | Enabled and enforcing on all three tables. |
| Auth user | `usefulcat@gmail.com` exists and is confirmed. |
| Public signups | **Disabled** — verified by an attempted signup returning `signup_disabled`. Shared shelves need this **on**; see "Not yet done". |
| `BGG_TOKEN` | Set as a function secret. |
| `bgg` edge function | Deployed and serving JSON. |

The anon/publishable key is public by design and ships in the web bundle; RLS is the security
boundary. **Never add the `service_role` key to this project.**

The Supabase CLI is authenticated on this machine but the project is **not linked** — there is no
`supabase/config.toml`. Every CLI command therefore needs `--project-ref blrqoobsbjbqmnwebaho`.
Linking it properly would remove that; nobody has decided whether to.

`supabase/.temp/` appears as untracked after CLI use and should probably be added to `.gitignore`.

---

## Defects

### 1. Signing in left the library empty until a reload — FIXED 2026-08-25 (uncommitted)

**What happened:** you signed in, and the library and labels were empty. They stayed empty for up to
a minute, or until you reloaded, pulled to refresh, or added something.

**Why**, confirmed by network trace rather than inference. `AuthGate` in `src/app/_layout.tsx`
renders the `Stack` as soon as `loading` is false, and the redirect to `/sign-in` runs in a
`useEffect` — i.e. after that first render. So `(tabs)` mounts briefly while signed out,
`useGames()` and `useLabels()` fire with only the anon key, RLS correctly returns `[]`, and
`staleTime: 60_000` keeps that empty result "fresh". Nothing invalidates the cache when the session
arrives, so no refetch happens.

Observed traffic on a cold load — note there is no request at all between them, at sign-in:

```
[200] GET /rest/v1/labels?select=*&order=name.asc   auth=anon-key-only  -> []
      ... sign-in happens, no request fired ...
[200] GET /rest/v1/labels?select=*&order=name.asc   auth=USER-JWT       -> 3 labels   (after reload)
```

It was masked in normal use because any mutation invalidates the cache — creating a label made
labels appear — which is why it survived earlier smoke testing.

**The fix** (three files, in the working tree, not committed):

- `lib/auth.tsx` — added `useUserId()`.
- `lib/queries/games.ts` — key is now `userGamesKey(userId)` = `['games', userId]`, plus
  `enabled: userId !== null`. `useDeleteGame`'s optimistic update uses the scoped key, since it
  writes to one specific cache entry.
- `lib/queries/labels.ts` — same treatment.

Two mechanisms on purpose. `enabled` stops the query firing before a session exists, so the empty
RLS result is never cached at all; the user-scoped key means that even if something did get cached,
a change of session is a change of key. That second part also stops one account's cached rows being
served to the next account signed in on the same device.

Mutations still invalidate the bare `['games']` / `['labels']` prefix, which React Query matches
against the scoped keys, so no mutation code changed.

**Verified after the fix**, same instrumentation that found it — signing in with no reload:

```
requests fired while signed out : 0        (was 2, both anon, both cached [])
requests at sign-in             : 2, both auth=USER-JWT
seeded game visible             : YES      (was NO until reload)
seeded label chip               : YES
```

`tsc --noEmit` clean, `expo lint` clean, 16/16 jest.

### 2. `game_labels` lets another user attach their label to your game — CLOSED by migration 0002

Superseded. The rewritten policy checks that both the game and the label live in the same library as
the join row, which is the `exists` clause the original note suggested. Kept below for the record.

#### Original entry

The `game_labels` RLS policy is a plain `user_id = auth.uid()` check with no join to `games` — the
denormalisation this project chose deliberately. Consequence, verified with two real accounts:
user B **can** insert a `game_labels` row pointing at user A's `game_id` (returns `201`), because the
foreign key check bypasses RLS and B's own `user_id` satisfies the policy.

It leaks nothing. Reading back through that link returns `"games": null` — RLS on `games` still
blocks it — and A's own view is unaffected. It also requires knowing A's game UUID. With signups
disabled and one real user, the practical impact is nil.

To close it anyway, add to the policy's `with check`:

```sql
and exists (select 1 from public.games where id = game_id and user_id = auth.uid())
```

That reintroduces the join the design was avoiding. Deliberately left open. *(Now closed — moving to
library membership meant rewriting this policy anyway, so the join came with it.)*

---

## Verified — no need to redo

**Static checks:** `npx tsc --noEmit` clean · `npx expo lint` clean · `npx jest` 16/16 passing
(covers `lib/filter.ts`) · `npx expo export -p web` exports all 9 routes with the real env loaded ·
`npx expo export -p android` bundles.

**RLS, exercised with two throwaway accounts** (since deleted). With A owning a game and a label,
B got `[]` for every read including fetch-by-exact-UUID, 0 rows affected on UPDATE and DELETE, and
`403 / 42501` when forging `user_id`. Anonymous insert is refused. See defect 2 for the one gap.

**BGG edge function:** search and detail both return clean JSON; CORS preflight returns
`Access-Control-Allow-Origin: *`; missing query → `400`, unknown action → `400`, bad id → `404`,
no auth header → `401`. The token is valid (BGG returns `401` without it, `200` with it).

**Full web walkthrough, 24/24 green**, driven in headless Chromium against the real database:
sign-in and redirect · sign-in error path · labels render as filter chips · BGG search through the
edge function · BGG import auto-filling image/year/players/playtime · saving an imported game ·
two manual adds · partial-name search (`glo` → 1 of 3) · no-match empty state · label filter
(Heavy → 2 of 3) · match any → match all (2 of 3 → 1 of 3) · all four sort keys with direction
toggle · sort choice surviving reload · session surviving reload · edit saved and reflected in the
list · delete, confirmed gone after reload · `window.confirm` fallback firing on both destructive
paths · sign out.

Test data was created and then removed through the UI; all three tables are back to 0 rows.

---

## Shared shelves (added 2026-08-25, unapplied)

A *library* — "shelf" in the UI — is now the unit of ownership. Games and labels carry a
`library_id`; people are rows in `library_members`; RLS asks "is the caller a member of this
library?" instead of `user_id = auth.uid()`. `games.user_id` and `labels.user_id` survive as "who
added this", nullable and no longer cascading.

Joining happens by redeeming an invite token at `/join/<token>`. There is deliberately **no insert
policy on `library_members`**: `redeem_library_invite()` is security definer and is the only way in.
`library_invite_preview()` is the one function granted to `anon`, so a visitor can see what they were
invited to before they have an account; it returns only the shelf's name and member count.

The membership helpers (`is_library_member`, `is_library_owner`) are security definer because a
policy on `library_members` that reads `library_members` recurses.

New files: `supabase/migrations/0002_shared_libraries.sql`, `0003_library_invites.sql`,
`src/lib/library.tsx`, `src/lib/invites.ts`, `src/lib/confirm.ts`, `src/lib/queries/libraries.ts`,
`src/app/shelf.tsx`, `src/app/join/[token].tsx`.

**Verified:** `tsc --noEmit` clean, `expo lint` clean, 16/16 jest, `expo export -p web` builds all 11
routes. **Not verified:** anything involving the database — see below.

## Not yet done

1. **Apply migrations 0002 and 0003.** Nothing has touched the live database; the app will fail
   against the current schema, because every query now filters on `library_id`. The project is not
   linked, so either link it or pass the connection explicitly:

   ```bash
   npx supabase link --project-ref blrqoobsbjbqmnwebaho
   npx supabase db push
   ```

   Both migrations are written to be re-runnable, and 0002 backfills a personal shelf for every
   existing `auth.users` row and moves their games and labels into it.

2. **Turn public sign-ups back on** under **Authentication → Sign In / Providers**. Invited people
   cannot make an account otherwise, and the sign-up form reports exactly that. A new account is not
   a way in: it lands on its own empty shelf, and only an invite token grants access to another.

3. **Exercise the share flow end to end** with a second account: create a link, open it in a private
   window, sign up, join, and confirm both accounts see the same games and each other's edits.
   `list_library_members()` returns members' email addresses to fellow members of that shelf — worth
   a look before inviting anyone outside the household.

4. **Review and commit the defect-1 fix.** It is in the working tree, unstaged.
2. **Android has never been run.** The emulator `Pixel_3a_API_33_x86_64` exists and `adb` sees no
   attached devices. `npm run android`. Everything about the app on Android is unverified —
   including whether `Alert.alert` (the native path, not the web `window.confirm` fallback) works
   for the two destructive confirmations.
3. **The cross-device check.** Add a game in the browser, open Android, confirm it appears. This is
   the whole reason the project chose cloud storage over local, and it has never been tested.
4. **APK:** `npx eas build:configure` first — there is no `eas.json`, so the previously suggested
   `--profile preview` does not exist yet. Then `npx eas build -p android --profile preview`.
   Needs a free Expo account; `eas login` is interactive.
5. *Optional:* `npx expo export -p web` and host `dist/` on Netlify / Cloudflare Pages.

---

## Decisions already made — don't re-litigate without a reason

- **Cloud, not local storage.** The user explicitly chose Supabase so browser and phone share one
  collection.
- **Shared shelves are collaborative, not read-only.** Asked on 2026-08-25 whether an invite link
  should give a read-only view or full membership, the user chose membership: everyone on a shelf
  can add, edit and delete. Owners additionally rename, remove people and revoke links.
- **The active shelf is remembered per user** (`AsyncStorage`, keyed by user id) and falls back to
  the personal shelf when the remembered one is gone — left, or removed from.
- **The whole library is fetched once and filtered in memory** (`lib/filter.ts`). A personal
  collection is small; this makes search instant and avoids a round trip per keystroke. Move search
  server-side in `lib/queries/games.ts` only if the collection passes a few thousand rows.
- **The anon key is public by design.** RLS is the security boundary.
- **`game_labels.user_id` is denormalised** so the RLS policy is a plain column check with no join.
  See defect 2 for what that costs.
- **Expo Go for dev, APK later.**
- **`Alert.alert` is a no-op on web**, so both destructive confirmations fall back to
  `window.confirm`. See `confirm()` in `(tabs)/labels.tsx` and `confirmDelete()` in `game/[id].tsx`.
  The web path is verified; the native path is not.
- **`thumbnail_url` is dropped when the user edits `image_url`** (`components/game-form.tsx`).
  `GameCard` falls back to `image_url`.
- **`tsconfig.json` sets `"types": ["jest", "node"]`** because TS 6 stopped picking up `@types`
  automatically here.

---

## If you automate the UI again

Hard-won selector notes, all of which cost a failed run:

- The tab bar items are `<a href="/">` and `<a href="/labels">` with `role="tab"`. Matching on the
  text "Library" hits the screen's `<h1>` heading first, which is not clickable.
- `game/new` is a **modal**: the Library and Labels tab screens stay mounted underneath and
  contribute their own `<input>`s. Absolute `nth()` indices into `input` are therefore wrong —
  offset from the Name field (`input[placeholder="Gloomhaven"]`) instead.
- For the same reason, a game name can match a *hidden* card under the modal. Filter to visible
  elements.
- The first page load compiles the dev bundle and can take ~9 minutes. Later loads are cached.
- Useful stable hooks: `aria-label="Add game"` (FAB), `aria-label="Clear search"`,
  `aria-label="Delete <label name>"` (label row), `a[href^="/game/"]` (game cards).

---

## Environment (machine `C:\Users\haydn`)

Node v24.18.1 · npm 11.16.0 · Git · Supabase CLI 2.115.0 via `npx` ·
Android SDK 33 at `%LOCALAPPDATA%\Android\Sdk` with emulator `Pixel_3a_API_33_x86_64`.

Commands: `npm run web` · `npm run android` · `npm test` · `npm run typecheck` · `npm run lint`.

Note: `curl` in Git Bash cannot verify Supabase's TLS certificate on this machine (stale CA bundle
at `C:/Program Files/Git/mingw64/ssl/certs/ca-bundle.crt`). Use PowerShell's `Invoke-WebRequest`,
which uses the Windows certificate store.
