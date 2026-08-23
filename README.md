# Board Game Shelf

A personal board game collection tracker that runs in the browser and as an Android app from one
Expo / React Native codebase, backed by a Supabase project so both see the same shelf.

- Add, edit and delete games
- Import cover art and metadata from BoardGameGeek
- Tag games with your own colour-coded labels
- Search by name, filter by label (match any or all), sort by name / year / rating / date added

## Stack

| Piece | What |
|---|---|
| App | Expo SDK 57 (React Native 0.86, React 19.2), TypeScript, expo-router |
| Web | react-native-web, static rendering (`app.json` → `web.output: "static"`) |
| Data | Supabase Postgres, row level security per user |
| Server state | TanStack Query |
| BGG | Supabase Edge Function proxy (`supabase/functions/bgg`) |

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

Then create your user under **Authentication → Users**, and turn off public sign-ups under
**Authentication → Sign In / Providers** so nobody else can register.

### 3. Run it

```bash
npm run web        # browser
npm run android    # Pixel emulator or a device running Expo Go
```

### 4. BoardGameGeek (optional)

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
  components/           GameCard, GameForm, LabelPicker, chips, inputs
  lib/
    supabase.ts         client (platform-aware auth storage)
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
