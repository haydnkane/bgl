# Board Game Shelf

A personal board game collection tracker that runs in the browser and as an Android app from one
Expo / React Native codebase, backed by a Supabase project so both see the same shelf.

- Add, edit and delete games
- Import cover art and metadata from BoardGameGeek
- Tag games with your own colour-coded labels
- Rate a game out of five stars and heart the ones you love — everyone keeps their own score,
  and sees everyone else's
- Search by name, filter by label (match any or all) or by who loves a game, sort by name / year /
  your rating / date added
- One shared shelf for the whole household, with per-person roles: owner, editor, or view-only.
  Rating is the one thing every role can do, view-only included

## Stack

| Piece | What |
|---|---|
| App | Expo SDK 57 (React Native 0.86, React 19.2), TypeScript, expo-router |
| Web | react-native-web, static rendering (`app.json` → `web.output: "static"`) |
| Data | Supabase Postgres, row level security on shelf membership |
| Server state | TanStack Query |
| BGG | Supabase Edge Function proxy (`supabase/functions/bgg`) |

> **Picking this up fresh?** Read [HANDOVER.md](HANDOVER.md) — it covers current status, the
> credentials still needed, and what to do next.

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase project

Create a free project at [supabase.com](https://supabase.com), then:

```bash
cp .env.example .env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → Data API**. The anon key is meant to be public — row level security is what keeps
the collection private, which is why the RLS check below matters.

Apply the schema:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Two settings under **Authentication** matter:

- **Sign In / Providers → Email**: turn **Confirm email** *off*. People sign in with a username, not
  an email address, so a confirmation link could never arrive (see [Usernames](#usernames) below).
- Leave public sign-ups **on**. Family members need to be able to create their own account, and an
  account on its own grants nothing — only being on the allowlist does.

The first person to sign in on a fresh project takes the shelf and becomes its owner, because there
is nobody yet who could have added them. Everyone after that has to be added by an owner.

### 3. Run it

```bash
npm run web        # browser
npm run android    # Pixel emulator or a device running Expo Go
```

### 4. Adding people

There is **one shelf**, for everyone — the database enforces it, and there is no way to create a
second. Who may use it is a list of usernames.

1. An owner taps the cog at the top of the library, adds the username under
   **Add someone**, and picks what they may do.
2. That person opens the app, chooses **First time here? Create an account**, and signs up with
   exactly that username and a password of their own.
3. They are in, with the role you chose. You can change it later from the same screen.

#### What each role may do

| | Browse, search, filter | Add / edit / delete games and labels | Manage people |
|---|---|---|---|
| **View only** (`member`) | yes | — | — |
| **Can edit** (`admin`) | yes | yes | — |
| **Owner** | yes | yes | yes |

Only owners see the cog at all. A view-only member gets no add button and a read-only game page.

None of that is UI-deep: the anon key ships inside the web bundle by design, so the split is written
into the row level security policies — reading is open to everyone on the list, and every way of
changing a row also asks whether the caller may write. Hiding a button is a courtesy; the policy is
the rule.

An owner cannot demote or remove themselves, so the collection can never end up with nobody able to
manage it.

Removing someone from the list revokes their access immediately — a database trigger drops their
membership with the entry. The games they added stay. Signing in with a username nobody has added
gets a "Not on the shelf" screen rather than an error: the account exists, it just has no access.

#### Usernames

Supabase Auth identifies accounts by email address, but nobody here needs a mailbox. A username is
turned into an address at `shelf.invalid` — a domain reserved by RFC 2606 so it can never exist —
and that is what Auth stores. Nothing is ever sent to it, which is why **Confirm email** has to be
off.

The constant lives in two places that must agree: `public.username_domain()` in
`supabase/migrations/0005_single_shelf.sql`, and `USERNAME_DOMAIN` in `src/lib/username.ts`. Accounts
created before usernames still sign in with their full email address; both forms resolve to the same
allowlist entry.

### 5. BoardGameGeek (optional)

The app works fully without this — you can paste any image URL by hand. To enable BGG search and
import, note that BGG's XML API now requires a registered bearer token, and sends no CORS headers.
The edge function solves both.

1. Register for a non-commercial XML API token at
   [BoardGameGeek](https://boardgamegeek.com/using_the_xml_api).
2. Store it and deploy the proxy:

```bash
npx supabase secrets set BGG_TOKEN=your-token
npx supabase functions deploy bgg
```

Until that is done, **Search BGG** shows a readable error and **Enter manually** still works.

## Checks

```bash
npm test           # unit tests for the search/filter/sort logic
npm run typecheck
npm run lint
```

## Deployment

Pushing to `main` builds the web app and publishes it to GitHub Pages at
<https://haydnkane.github.io/bgl>, applies any new Supabase migrations, and redeploys the `bgg`
edge function. Pull requests run the checks only. See [.github/workflows/](.github/workflows/).

The site is exported as a single-page app (`web.output: "single"`) served from the `/bgl` subpath
(`experiments.baseUrl`). CI copies `index.html` to `404.html` so that a cold visit to a deep link
such as `/game/<id>` boots the router rather than showing GitHub's 404 page.

### Repository configuration

Under **Settings → Pages**, set the source to **GitHub Actions**. Then add the following under
**Settings → Secrets and variables → Actions**.

| Name | Kind | Value |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Secret | Your project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Secret | The anon key |
| `SUPABASE_DB_URL` | Secret | Postgres connection string, from Dashboard → Connect |
| `SUPABASE_ACCESS_TOKEN` | Secret | Personal access token, from Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Variable | Your project ref |

The two `EXPO_PUBLIC_` values are stored as secrets for tidiness, but they are compiled into the
JS bundle and readable by anyone who loads the site. That is expected — the anon key is public by
design and row level security is what protects the data. `SUPABASE_DB_URL` and
`SUPABASE_ACCESS_TOKEN` are genuinely secret and must never reach the client.

### Migrations

The deploy workflow runs `supabase db push` against the live database on every push to `main`. It
lists pending migrations before applying them, so the run log records what changed. To require
sign-off first, add yourself as a required reviewer on the `bgl` environment under
**Settings → Environments**; the job then waits for approval before touching the database.

## Android APK

```bash
npx eas build -p android --profile preview
```

## Layout

```
src/
  app/                  routes (expo-router)
    (tabs)/index.tsx    library: search, filter, sort
    (tabs)/labels.tsx   manage labels
    game/new.tsx        add — BGG search or manual entry
    game/[id].tsx       detail, edit, delete, refresh from BGG
    settings.tsx        who is allowed in — the only thing there is to configure
  components/           GameCard, GameForm, LabelPicker, chips, inputs
  lib/
    supabase.ts         client (platform-aware auth storage)
    library.tsx         resolving membership of the one shelf, and joining it
    username.ts         usernames <-> the addresses Supabase Auth stores
    filter.ts           pure search/filter/sort — unit tested
    bgg.ts              typed client for the edge function
    queries/            TanStack Query hooks
supabase/
  migrations/           schema, indexes, RLS policies
  functions/bgg/        BoardGameGeek proxy (Deno)
```

## Notes

- The whole library is fetched once and filtered in memory. That keeps search instant and works
  offline; if the collection ever passes a few thousand games, move the search server-side in
  `lib/queries/games.ts`.
- BGG rate limits apply even with a token, so search input is debounced by 400ms.
- Joining goes through `join_shelf()` rather than a table write: there is no insert policy on
  `library_members` at all, so being on the allowlist is the only way in.
- `library_id` survives on `games` and `labels` even though it can only hold one value now. It is
  the column every RLS policy is written against, so keeping it avoided rewriting them all.
