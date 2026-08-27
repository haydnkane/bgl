# Board Game Shelf

A personal board game collection tracker that runs in the browser and as an Android app from one
Expo / React Native codebase, backed by a Supabase project so both see the same shelf.

- Add, edit and delete games
- Import cover art and metadata from BoardGameGeek
- Tag games with your own colour-coded labels
- Search by name, filter by label (match any or all), sort by name / year / rating / date added
- Share a shelf by link: whoever joins can add, edit and remove games alongside you

## Stack

| Piece | What |
|---|---|
| App | Expo SDK 57 (React Native 0.86, React 19.2), TypeScript, expo-router |
| Web | react-native-web, static rendering (`app.json` → `web.output: "static"`) |
| Data | Supabase Postgres, row level security per shelf membership |
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

Then create your user under **Authentication → Users**.

Leave public sign-ups **on** under **Authentication → Sign In / Providers**: people you invite to a
shared shelf need to be able to create an account. An account on its own reveals nothing — a new
user gets an empty shelf of their own, and only an invite link grants access to yours.

### 3. Run it

```bash
npm run web        # browser
npm run android    # Pixel emulator or a device running Expo Go
```

### 4. Sharing a shelf

A *shelf* is the unit of ownership: games and labels belong to one, and people are members of it.
Everyone gets their own shelf on first sign-in, and can be on any number of shared ones.

1. Tap the shelf name at the top of the library, then **New link**. It is copied to the clipboard.
2. Send it. The recipient sees the shelf's name and how many people are on it, signs in or creates
   an account, and joins — the link survives the trip through sign-up.
3. Everyone on a shelf can add, edit and delete its games and labels. Owners can additionally
   rename it, remove people, and revoke links.

Revoking a link stops anyone new joining with it; it does not remove people who already have. Take
them off under **People**. The token in a link is the only thing protecting the shelf, so treat it
like a key — links can be set to expire after 7 days, or never.

Set `EXPO_PUBLIC_WEB_URL` to your deployed web address so links created on the phone open in a
browser for people who do not have the app.

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
such as `/join/<token>` boots the router rather than showing GitHub's 404 page — without that step
invite links are broken.

### Repository configuration

Under **Settings → Pages**, set the source to **GitHub Actions**. Then add the following under
**Settings → Secrets and variables → Actions**.

| Name | Kind | Value |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Secret | Your project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Secret | The anon key |
| `SUPABASE_DB_URL` | Secret | Postgres connection string, from Dashboard → Connect |
| `SUPABASE_ACCESS_TOKEN` | Secret | Personal access token, from Account → Access Tokens |
| `EXPO_PUBLIC_WEB_URL` | Variable | `https://haydnkane.github.io/bgl` |
| `SUPABASE_PROJECT_REF` | Variable | Your project ref |

The two `EXPO_PUBLIC_` values are stored as secrets for tidiness, but they are compiled into the
JS bundle and readable by anyone who loads the site. That is expected — the anon key is public by
design and row level security is what protects the data. `SUPABASE_DB_URL` and
`SUPABASE_ACCESS_TOKEN` are genuinely secret and must never reach the client.

### Migrations

The deploy workflow runs `supabase db push` against the live database on every push to `main`. It
lists pending migrations before applying them, so the run log records what changed. To require
sign-off first, add yourself as a required reviewer on the `production` environment under
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
    shelf.tsx           members, invite links, switching shelves
    join/[token].tsx    invite landing page — reachable signed out
  components/           GameCard, GameForm, LabelPicker, chips, inputs
  lib/
    supabase.ts         client (platform-aware auth storage)
    library.tsx         which shelf is active, and remembering it
    invites.ts          invite URLs, and holding a token through sign-up
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
- Joining a shelf goes through `redeem_library_invite()` rather than a table write: there is no
  insert policy on `library_members` at all, so a valid token is the only way in.
