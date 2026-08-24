# Handover

Status as of 2026-08-24. Written for whoever (or whatever) picks this up next.

**One-line summary:** the app is fully built, typechecked, linted, unit-tested and bundling for both
web and Android — but it has never talked to a real database, because no Supabase project exists yet.
Everything outstanding is blocked on credentials, not on code.

---

## What this is

A personal board game collection tracker for `usefulcat@gmail.com`, running in the browser and as an
Android app from one Expo codebase. Requested features, all implemented:

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
- `AGENTS.md` in this repo says to read https://docs.expo.dev/versions/v57.0.0/ before writing code.
  Worth honouring — SDK 57 moved things.

---

## THE BLOCKER: no Supabase project exists

`.env.local` currently holds **placeholder values** so that builds and the static export succeed.
The app will not authenticate or store anything until real values replace them.

### Values needed — tier 1 (required, public by design)

Ask the user for these two. Both are compiled into the web bundle; Supabase intends them to be
public, and RLS is the real security boundary.

| Value | Where in the dashboard | Goes into |
|---|---|---|
| Project URL — `https://<ref>.supabase.co` | Project Settings → Data API (or API) → Project URL | `.env.local` → `EXPO_PUBLIC_SUPABASE_URL` |
| Anon / publishable key | Project Settings → API Keys → `anon` `public` (a long `eyJ…` JWT) or `Publishable key` (`sb_publishable_…`) | `.env.local` → `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

Either key format works with supabase-js.

**Never request or accept the `service_role` / secret key.** The app does not use it and it must
never reach a client bundle.

### Values needed — tier 2 (only to apply the migration on the user's behalf)

`supabase/migrations/0001_init.sql` has to be applied. Two routes — **offer the first one first**:

1. **No secrets shared (preferred):** the user pastes the SQL file into the dashboard SQL Editor and
   runs it. Takes a minute. Verifiable afterwards using only the anon key.
2. **We run it:** needs the **database connection string** (Project Settings → Database →
   Connection string → URI) with the password filled in, then:
   `npx supabase db push --db-url "<uri>"`.
   That's a real credential granting full DB access. Flag the tradeoff and suggest rotating after.

### Values needed — tier 3 (only to deploy the BGG edge function)

A **Supabase personal access token** (Account → Access Tokens → Generate new token), for
`npx supabase functions deploy bgg` and `npx supabase secrets set`. Also a real credential — the user
can equally run those two commands themselves.

### Values needed — tier 4 (to actually verify RLS)

To prove row-level security works rather than assuming it, sign in as two different users via the
API. Suggested approach that keeps the real account private: the user creates **two throwaway users**
in Authentication → Users (e.g. `test-a@example.com` / `test-b@example.com`) with disposable
passwords and shares those four values; delete them afterwards.

### The BGG token (separate from Supabase)

BoardGameGeek's XML API is **no longer open**. An unauthenticated request to
`https://boardgamegeek.com/xmlapi2/search?query=gloomhaven` returns `Unauthorized` — verified
directly on 2026-08-23. BGG now requires registration and a bearer token
([announcement](https://boardgamegeek.com/thread/3539581/xml-api-read-this-for-uninterrupted-access),
[registration](https://boardgamegeek.com/thread/3525319/registration-to-use-the-xml-api-and-obtain-soon-to)).
It also sends no CORS headers, so a browser cannot call it directly at all.

Both problems are why `supabase/functions/bgg` exists: it holds the token server-side and returns
CORS-friendly JSON. Registration is a **manual step the user must do on BGG's site**; approval is not
instant.

Until `BGG_TOKEN` is set, "Search BGG" shows a readable error and "Enter manually" (with a plain
image-URL field) still works. That fallback was built deliberately for this gap — do not treat a
missing token as a broken app.

---

## Next steps, in order

1. **Get tier-1 values, write `.env.local`.** Then `npm run web` and confirm the sign-in screen
   renders and the console shows no Supabase config error.
2. **Apply the migration** (tier 2). Confirm in the SQL editor that `games`, `labels` and
   `game_labels` all report `rowsecurity = true`.
3. **Create the user.** Authentication → Users → add the real account. Then turn **off public
   sign-ups** under Authentication → Sign In / Providers — this is a single-user app with no
   sign-up screen.
4. **Run the RLS isolation check** (tier 4). This is the one test worth not skipping: the anon key
   ships publicly, so RLS is the only thing keeping the collection private.
5. **Walk the features end to end, on web *and* Android** — a change that works on one can break on
   the other:
   sign in → add a game manually with a pasted image URL → create labels "Co-op", "Heavy",
   "2-player" → tag it → search a partial name → filter by a label → select two labels and toggle
   match any/all → sort by year, then rating → edit labels and watch the filtered view update →
   delete a game and confirm it stays gone after refresh → **add a game in the browser, reload
   Android, confirm it appears**.
6. **BGG** (whenever the token arrives): `npx supabase secrets set BGG_TOKEN=…` then
   `npx supabase functions deploy bgg`. Verify with
   `npx supabase functions serve bgg` +
   `curl "http://localhost:54321/functions/v1/bgg?action=search&query=gloomhaven" -H "Authorization: Bearer <user-jwt>"`
   → expect JSON, not XML and not `Unauthorized`. Then confirm in the browser network tab that the
   cross-origin call succeeds (that's the CORS proof), and that unsetting the token degrades to a
   readable error with manual entry still working.
7. **APK:** `npx eas build -p android --profile preview` (needs an EAS account).
8. *Optional:* `npx expo export -p web` and host `dist/` on Netlify / Cloudflare Pages to give the
   browser version a URL.

---

## Already verified — no need to redo

- `npx tsc --noEmit` clean
- `npx expo lint` clean
- `npx jest` — 16/16 passing, covering `lib/filter.ts` (search matching, any-vs-all label logic,
  every sort key, nulls-sort-last, purity)
- `npx expo export -p web` — all 9 routes render statically; the HTML is the loading spinner plus the
  bundle, which is correct for an auth-gated client app
- `npx expo export -p android` — bundles

Verification stops at the sign-in gate. **No real round trip to Postgres has ever happened.**

## Decisions already made — don't re-litigate without a reason

- **Cloud, not local storage.** The user explicitly chose Supabase so browser and phone share one
  collection.
- **The whole library is fetched once and filtered in memory** (`lib/filter.ts`). A personal
  collection is small; this makes search instant and avoids a round trip per keystroke. Move search
  server-side in `lib/queries/games.ts` only if the collection passes a few thousand rows.
- **The anon key is public by design.** RLS is the security boundary — hence step 4 above.
- **`game_labels.user_id` is denormalised** so the RLS policy is a plain column check with no join.
- **Expo Go for dev, APK later**, per the user's choice. Expo Go for SDK 57 was still awaiting Play
  Store approval; the CLI sideloads a matching build onto the emulator. If that turns out flaky, the
  escape hatch is pinning to SDK 54 (`--template default@sdk-54`), which is fully published. Nothing
  else in the design depends on the SDK version.
- **`Alert.alert` is a no-op on web**, so both destructive confirmations fall back to
  `window.confirm`. See `confirm()` in `(tabs)/labels.tsx` and `confirmDelete()` in `game/[id].tsx`.
- **`thumbnail_url` is dropped when the user edits `image_url`** (`components/game-form.tsx`), since a
  BGG thumbnail no longer matches a hand-entered image. `GameCard` falls back to `image_url`.
- **`tsconfig.json` sets `"types": ["jest", "node"]`** because TS 6 stopped picking up `@types`
  automatically here; without it the test file fails to typecheck.

## Environment (verified 2026-08-23, machine `C:\Users\haydn`)

Node v24.18.1 · npm 11.16.0 · Git · Supabase CLI 2.115.0 via `npx` ·
Android SDK 33 at `%LOCALAPPDATA%\Android\Sdk` with emulator `Pixel_3a_API_33_x86_64`.

Commands: `npm run web` · `npm run android` · `npm test` · `npm run typecheck` · `npm run lint`.

`.env.local` is gitignored. Keep it that way.
