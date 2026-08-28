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
| `EXPO_TOKEN` | Secret | Expo access token, for the Android OTA job |
| `EAS_UPDATES_ENABLED` | Variable | `true` to switch the Android OTA job on |

The two `EXPO_PUBLIC_` values are stored as secrets for tidiness, but they are compiled into the
JS bundle and readable by anyone who loads the site. That is expected — the anon key is public by
design and row level security is what protects the data. `SUPABASE_DB_URL` and
`SUPABASE_ACCESS_TOKEN` are genuinely secret and must never reach the client.

The last two rows only matter for Android and are covered in [Android APK](#android-apk).
The `update` job stays skipped while `EAS_UPDATES_ENABLED` is unset, so the web deploy runs
fine without them.

### Migrations

The deploy workflow runs `supabase db push` against the live database on every push to `main`. It
lists pending migrations before applying them, so the run log records what changed. To require
sign-off first, add yourself as a required reviewer on the `bgl` environment under
**Settings → Environments**; the job then waits for approval before touching the database.

## Android APK

Android is distributed by sideloading a signed APK — no Play Store listing, no developer account.
`eas.json` defines one build profile, `preview`, which produces an installable APK through EAS
Build's internal distribution. Once installed, the app pulls new JavaScript over the air on launch,
so most changes reach the phone without anyone reinstalling anything.

### One-time setup

Do all four of these before the first build. Step 3 in particular has to happen first: the update
URL is baked into the binary, and an APK built before it exists can never receive an update.

**1. Link the project to EAS**

```bash
npx eas-cli login     # free Expo account, interactive
npx eas-cli init      # writes extra.eas.projectId into app.json
```

**2. Give EAS the Supabase credentials**

EAS builds run on Expo's servers from the **git-tracked** files, so `.env.local` never reaches
them. `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are inlined into the bundle at
build time and `src/lib/supabase.ts` throws on startup when they are missing — an APK built without
them crashes the moment it opens.

```bash
npx eas-cli env:set --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<your-project-ref>.supabase.co

npx eas-cli env:set --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <your-anon-key>
```

`plaintext` is deliberate: both values are public by design — the same pair the web deploy inlines
from repository secrets. Check them with `npx eas-cli env:list --environment production`.

The `preview` build profile reads from the `production` environment because there is one Supabase
project behind both web and Android, not two. The OTA workflow reads from it as well, so the APK
and the JavaScript that later replaces its own are always built against the same backend.

**3. Turn on updates**

```bash
npx eas-cli update:configure
```

This writes `updates.url` into `app.json`. `runtimeVersion` is already set to the `fingerprint`
policy and `eas.json` already puts builds on the `production` channel, so there is nothing else to
edit here.

**4. Let CI publish updates**

Create an access token at **expo.dev → account settings → access tokens**, then in this repository
under **Settings → Secrets and variables → Actions**:

- add a secret `EXPO_TOKEN` with that token
- add a variable `EAS_UPDATES_ENABLED` set to `true`

The `update` job in `deploy.yml` is skipped entirely until that variable is `true`, so the web
deploy is never taken down by a half-configured EAS setup.

### Building the APK

```bash
npm run build:android
```

The first build asks to generate an Android keystore — say yes. EAS stores it against the project
and reuses it for every build after, which is what lets a new APK install over the old one.

The build finishes with a URL and a QR code. Scan it with the phone, download, and accept Android's
prompt to allow installs from the browser. Nothing needs registering per device, and the other
people on the shelf just need the same link. Alternatively, with a device on USB or the emulator
running:

```bash
npx eas-cli build:run -p android --latest            # emulator
npx eas-cli build:run -p android --latest --device   # attached phone
```

`appVersionSource: "remote"` in `eas.json` means EAS tracks `versionCode` and bumps it on each
build, so updates install cleanly over the previous version without hand-editing `app.json`.

Back the keystore up with `npx eas-cli credentials`. If it is lost, Android refuses to install any
future APK over the installed app — it has to be uninstalled first, which takes the local session
with it.

### Over-the-air updates

After setup, every push to `main` publishes a new JavaScript bundle to the `production` channel,
gated behind the same migration job as the web deploy so the database is never behind the code.

Installed apps check for it on launch, download in the background, and run it on the **next**
launch — so a change lands on the second open, not the first. That is `expo-updates` default
behaviour, not a bug.

To publish by hand:

```bash
npx eas-cli update --channel production --environment production --message "what changed"
```

**When a new APK is unavoidable.** `runtimeVersion` uses the `fingerprint` policy, which hashes
everything that affects the native build. Add or upgrade a native dependency and the fingerprint
changes, so already-installed APKs stop matching and quietly stop receiving updates — correct
behaviour, since that JavaScript would crash against the old native code, but it is silent. Any
change to `package.json` native dependencies, `app.json` plugins, or the Expo SDK version means
rebuilding and redistributing the APK. Pure JavaScript, styling and route changes go over the air.

### If the Play Store ever comes up

Add a second profile with `"buildType": "app-bundle"` and `"distribution": "store"`, plus a
`submit` block with a Google service account key, then `npx eas-cli submit -p android`. Be aware
that a personal Play developer account created after 13 November 2023 must first run a closed test
with 12 testers opted in for 14 continuous days before it can be granted production access.

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
