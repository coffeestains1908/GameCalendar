# Cloudflare D1 + Worker Feasibility and Migration Plan

## Executive summary

Migrating this app from Firestore and Firebase Cloud Functions to Cloudflare D1 and Workers is feasible. The recommended first version keeps Firebase Authentication and replaces Firestore plus Cloud Functions with a Cloudflare Worker API backed by D1.

A Worker is required for the migration. D1 is a server-side SQLite database exposed to Workers through bindings, not a browser database SDK with client-side security rules. The Worker must become the app's authorization, validation, transaction, and reCAPTCHA boundary.

Recommended approach:

- Keep Firebase Auth for login/session management in the first migration.
- Move all Firestore reads and writes in `src/events.js` and `src/firebase.js` behind HTTP API calls to a Worker.
- Replace callable Cloud Functions with Worker routes.
- Model Firestore collections as relational D1 tables with explicit indexes.
- Run Firebase and D1 in parallel during migration, then cut over once parity checks pass.

References:

- Cloudflare D1 overview: https://developers.cloudflare.com/d1/
- D1 Workers binding API: https://developers.cloudflare.com/d1/worker-api/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Workers bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Drizzle ORM D1 guide: https://orm.drizzle.team/docs/connect-cloudflare-d1
- Drizzle D1 setup: https://orm.drizzle.team/docs/get-started/d1-new

## Current Firebase surface

The app currently uses Firebase in three ways:

1. Firebase Auth
   - Admin and GM login use `signInWithEmailAndPassword`.
   - Auth state is read with `onAuthStateChanged`.
   - Admin checks currently read `admins/{lowercaseEmail}` from Firestore.
   - GM profile checks currently read `gameMasters/{uid}` from Firestore.

2. Direct Firestore client access
   - `src/events.js` reads and writes `events`, `games`, `gameMasters`, `eventSecrets`, and `events/{eventId}/players`.
   - Public users read published events and invite player lists.
   - Admins manage all events, games, game masters, event secrets, and players.
   - GMs manage their own events, event secrets, and players.

3. Firebase Cloud Functions
   - `joinEvent`: verifies reCAPTCHA, checks published/invite state, validates PIN, enforces max players transactionally, and inserts a player.
   - `verifyRecaptchaToken`: verifies login reCAPTCHA tokens.
   - `createGameMasterAccount`, `updateGameMasterAccount`, `deleteGameMasterAccount`: admin-only Firebase Auth user management plus Firestore profile writes.

Firestore Security Rules currently enforce most data access behavior. In D1, these rules must be reimplemented in Worker code and covered by tests.

## Feasibility verdict

Feasible, medium complexity.

The data model is small and relational-friendly:

- Events are naturally a table.
- Players are a child table keyed by event ID.
- Games, game masters, admins, and event secrets are simple tables.
- Current query patterns map cleanly to SQL indexes.

The main complexity is not SQLite. It is replacing Firebase's managed security boundary:

- Firestore Security Rules become explicit Worker authorization logic.
- Callable Functions become normal JSON API routes.
- Firebase Admin SDK usage inside Cloud Functions does not move directly to Workers. Worker-compatible Firebase Auth administration must use Google/Firebase REST APIs or remain as a temporary Firebase Function dependency.
- D1 has single-database throughput characteristics. This app's expected traffic appears well within D1's practical range, but high write spikes for joins should be tested.

## Recommended target architecture

### Keep Firebase Auth initially

Keep Firebase Auth for the first migration because it avoids rebuilding login, password storage, account recovery, and session persistence at the same time as the database migration.

The frontend can continue to use:

- `firebase/auth`
- `signInWithEmailAndPassword`
- `signOut`
- `onAuthStateChanged`
- `user.getIdToken()`

The Worker should verify Firebase ID tokens on authenticated routes. Verification can be implemented by validating the JWT signature against Google's public keys and checking issuer, audience, expiry, and subject.

### Replace Firestore with Worker API

The browser should stop importing `firebase/firestore` after cutover. Instead:

- Create an API client module, for example `src/api.js`.
- Preserve the current exported functions from `src/events.js` where practical, but make them call `/api/...`.
- Convert date strings from the API into `Date` objects at the client boundary so page components need minimal changes.

### Replace Cloud Functions with Worker routes

Move the existing Cloud Function behavior into Worker endpoints:

- `verifyRecaptchaToken` becomes `POST /api/recaptcha/verify`.
- `joinEvent` becomes `POST /api/events/:eventId/join`.
- GM account management becomes `/api/game-masters` routes.

### Hosting

Firebase Hosting can remain temporarily. The Worker API can live on a Cloudflare route or `workers.dev` URL and be configured with CORS.

A later phase can move the Vite static build to Cloudflare Pages or Workers static assets. That is not required for the database migration.

## Proposed repository structure

Keep the first migration structurally conservative: leave the Vite React app at the repository root and add a dedicated Worker package beside it. This avoids a broad monorepo refactor while still giving the Worker, D1 migrations, tests, and migration tooling clear ownership boundaries.

Recommended target layout:

```text
/
  src/                         # React app
  worker/                      # Cloudflare Worker API
    src/
      index.js                 # Worker entrypoint and route registration
      routes/                  # Route handlers grouped by domain
      auth/                    # Firebase ID token verification and role checks
      db/                      # D1 query helpers and transactions
        schema.js              # Drizzle table definitions for migration generation
      validation/              # Request validation and shared limits
      errors.js                # API error mapping
    migrations/                # D1 SQL migrations
    drizzle.config.js          # Drizzle Kit migration generation config
    test/                      # Worker/API tests
    wrangler.toml              # Worker config and D1 binding
    package.json               # Worker-local scripts and dependencies
  scripts/
    migrate-firestore-to-d1/   # Export, transform, import, and parity tooling
  functions/                   # Temporary Firebase Functions during migration
  docs/
```

Ownership boundaries:

- `src/` remains browser-only. It should not import D1 code, Worker internals, service credentials, reCAPTCHA secrets, or server-only Firebase administration code.
- `worker/` owns authorization, validation, reCAPTCHA verification, D1 access, transactions, and JSON API routes.
- `worker/src/routes/` should be grouped by product domain, for example events, players, games, game masters, reCAPTCHA, and current-user profile routes.
- `worker/src/auth/` should centralize Firebase ID token verification, admin checks, active GM checks, and owner/admin authorization helpers.
- `worker/src/db/` should contain SQL query helpers and transaction helpers. Route handlers should not build complex SQL inline unless the query is route-specific and small.
- `worker/src/validation/` should hold request validators and shared limits such as max player bounds, string lengths, PIN shape, and color validation.
- `scripts/migrate-firestore-to-d1/` owns one-off export, transform, import, and parity-check tooling. Runtime Worker code should not depend on these scripts.
- `functions/` remains only as a temporary Firebase Functions fallback, primarily for GM account management if Worker-based Firebase Auth administration is deferred.

Frontend API boundary:

- Add a browser API client module, for example `src/api.js`, for Worker HTTP calls, Authorization headers, JSON parsing, and API error normalization.
- Keep the exported functions in `src/events.js` stable where practical so page components can migrate with minimal churn.
- Keep Firebase Auth setup in `src/firebase.js` while Firebase Auth remains the login provider.
- After cutover, remove Firestore and Firebase Functions imports from browser code. `src/firebase.js` should no longer export `db`, `functions`, or `callFunction` once no browser code uses them.

Package and script boundaries:

- The root `package.json` should continue to own the Vite app lifecycle: local dev, build, preview, and Firebase Hosting deploy while hosting remains on Firebase.
- `worker/package.json` should own Worker-specific scripts such as Wrangler dev, Worker tests, Drizzle migration generation, D1 migration apply commands, and Worker deploy.
- Add `drizzle-kit` as a Worker dev dependency. Add `drizzle-orm` as a Worker runtime dependency only if Worker route code uses Drizzle for queries instead of raw D1 prepared statements.
- Recommended Worker scripts are `db:generate` for Drizzle Kit migration generation, `db:migrate:local` for local `wrangler d1 migrations apply`, and `db:migrate:remote` for remote `wrangler d1 migrations apply --remote`.
- Avoid sharing runtime modules directly between browser and Worker unless they are pure constants or validation helpers with no platform dependencies. If shared code is needed, add it deliberately after both sides have a concrete use case.

Migration sequencing for this structure:

1. Add `worker/`, `worker/wrangler.toml`, Drizzle schema/config, and D1 migrations first.
2. Add `src/api.js` while the existing Firestore implementation still exists.
3. Move low-risk reads to the Worker API, then management writes, then join/reCAPTCHA behavior.
4. Move or retire GM account-management Cloud Functions after Worker-compatible Firebase Auth administration is validated.
5. Remove `functions/` only after all callable Function behavior has Worker parity and production traffic has been cut over.

## Migration library recommendation

Use Drizzle Kit as the SQLite migration generation library for the Worker package. Define the D1 schema in `worker/src/db/schema.js` or `worker/src/db/schema.ts`, generate SQL migrations into `worker/migrations/`, then apply those migrations with Wrangler. Wrangler and D1 should remain the source of truth for what has been applied to local and remote databases.

Recommended responsibilities:

- Drizzle Kit owns schema-as-code and SQL migration generation.
- `worker/migrations/` stores the generated SQL files that are reviewed and committed.
- Wrangler applies migrations with D1's native migration tracking.
- Firestore-to-D1 export/import scripts remain separate from schema migrations.

This keeps the schema maintainable without making the first migration depend on a full ORM rewrite. Worker route handlers can start with raw D1 prepared statements and move to `drizzle-orm/d1` later if typed query composition becomes useful.

Implementation notes:

- Review generated SQL before applying it to D1.
- Keep destructive schema changes explicit and separate from data backfills.
- Do not put Firestore data transforms inside Drizzle migrations; keep those in `scripts/migrate-firestore-to-d1/`.
- Treat `drizzle-kit push` as a development convenience only, not the production deployment path. Production and shared environments should use generated migration files applied through Wrangler.

## Proposed D1 schema

Use UTC ISO-8601 text timestamps for application timestamps. They are easy to serialize to JSON, sort lexicographically, and convert to `Date` in the browser.

```sql
CREATE TABLE admins (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_masters (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  game_master TEXT NOT NULL,
  game_master_uid TEXT NOT NULL,
  created_by TEXT NOT NULL,
  invite_enabled INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER,
  game TEXT NOT NULL,
  game_color TEXT,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_at > start_at),
  CHECK (invite_enabled IN (0, 1)),
  CHECK (published IN (0, 1)),
  CHECK (max_players IS NULL OR (max_players >= 1 AND max_players <= 24))
);

CREATE TABLE event_secrets (
  event_id TEXT PRIMARY KEY,
  pin TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE event_players (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  joined_by TEXT NOT NULL DEFAULT 'invite',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_events_published_end_at ON events(published, end_at);
CREATE INDEX idx_events_created_by_end_at ON events(created_by, end_at);
CREATE INDEX idx_events_end_at ON events(end_at);
CREATE INDEX idx_event_players_event_joined_at ON event_players(event_id, joined_at);
CREATE INDEX idx_games_name ON games(name);
CREATE INDEX idx_game_masters_name ON game_masters(name);
```

Notes:

- Store booleans as `0`/`1`.
- Use generated IDs from `crypto.randomUUID()` in the Worker.
- Consider hashing event PINs instead of storing plaintext. The current Firestore design stores plaintext PINs in `eventSecrets`; migration can preserve behavior initially, then upgrade.
- Keep `created_by` and `game_master_uid` as Firebase Auth UIDs while Firebase Auth remains active.

## Worker API surface

Use JSON responses consistently:

```json
{
  "data": {},
  "error": null
}
```

Error responses should include:

```json
{
  "error": {
    "code": "permission-denied",
    "message": "Admin access is required."
  }
}
```

Use codes compatible with the existing frontend mapping where possible:

- `unauthenticated`
- `permission-denied`
- `invalid-argument`
- `failed-precondition`
- `not-found`
- `out-of-range`
- `already-exists`

### Public routes

- `GET /api/events/public`
  - Returns published events whose `end_at` is within the current public window.
  - Includes `playerCount` for invite-enabled events.

- `GET /api/events/:eventId`
  - Returns the event if it is published, or if the authenticated user is an admin or owner.

- `GET /api/events/:eventId/players`
  - Public only when the event is published and invite-enabled.
  - Admins and owners can always read.

- `POST /api/events/:eventId/join`
  - Body: `{ "name": "...", "pin": "123456", "recaptchaToken": "..." }`
  - Verifies reCAPTCHA action `join_event`.
  - Confirms event exists, is published, and invite-enabled.
  - Confirms PIN.
  - Enforces `max_players` transactionally.
  - Inserts the player row.

### Authenticated user routes

- `GET /api/me/admin`
  - Requires Firebase ID token.
  - Checks `admins.email`.
  - Replaces `isAllowedAdmin`.

- `GET /api/me/gm-profile`
  - Requires Firebase ID token.
  - Reads `game_masters.uid`.
  - Replaces `fetchGameMasterProfile`.

### Event management routes

- `GET /api/events/admin`
  - Admin only.
  - Replaces `fetchAdminEvents`.

- `GET /api/events/gm`
  - Active GM only.
  - Returns events where `created_by` is the authenticated UID.
  - Replaces `fetchGameMasterEvents`.

- `POST /api/events`
  - Admin or active GM.
  - Validates event fields.
  - For GM, forces `created_by` and `game_master_uid` to the caller UID.
  - Optionally creates `event_secrets`.

- `PATCH /api/events/:eventId`
  - Admin or owner.
  - Validates event fields.
  - Updates event and optional invite secret.

- `PATCH /api/events/:eventId/published`
  - Admin only.
  - Replaces `updateEventPublished`.

- `DELETE /api/events/:eventId`
  - Admin or owner.
  - Deletes event; cascading foreign keys delete secret and players.

- `GET /api/events/:eventId/secret`
  - Admin or owner only.

- `DELETE /api/events/:eventId/secret`
  - Admin or owner only.

### Player management routes

- `PATCH /api/events/:eventId/players/:playerId`
  - Admin or owner only.

- `DELETE /api/events/:eventId/players/:playerId`
  - Admin or owner only.

### Games routes

- `GET /api/games`
  - Public.

- `POST /api/games`
  - Admin only.

- `DELETE /api/games/:gameId`
  - Admin only.

The current app does not expose game updates, so no update route is needed for parity.

### Game master routes

- `GET /api/game-masters`
  - Admin only.

- `POST /api/game-masters`
  - Admin only.
  - Creates Firebase Auth user and D1 `game_masters` row.

- `PATCH /api/game-masters/:uid`
  - Admin only.
  - Updates Firebase Auth user and D1 profile row.

- `DELETE /api/game-masters/:uid`
  - Admin only.
  - Disables Firebase Auth user and deletes D1 profile row.

This is the hardest Worker migration path because the current implementation uses Firebase Admin SDK inside Cloud Functions. Cloudflare Workers cannot use the Node Firebase Admin SDK directly in the same way. The implementation should either:

1. Use Google/Firebase REST APIs from the Worker with a securely stored service credential or access-token flow.
2. Temporarily keep only these account-management operations in Firebase Cloud Functions while all data operations move to D1.

For a clean "no Cloud Functions" cutover, choose option 1 and test it carefully before migration.

## Authorization rules to preserve

The Worker must preserve these behavior rules from Firestore Rules and Cloud Functions:

- Public users can read only published events, except event player lists are public only for published invite-enabled events.
- Public users cannot create players directly except through the join endpoint.
- Admins are identified by `admins.email`.
- Active GMs are identified by `game_masters.uid` with `active = 1`.
- GMs can create events only for themselves.
- GMs can update/delete only events they own.
- Admins can manage all events, games, game masters, secrets, and players.
- Only admins can toggle publish via the narrow publish endpoint.
- Event writes must validate required fields, date order, booleans, max player bounds, string lengths, and hex colors.
- Join flow must verify reCAPTCHA, event state, PIN, and max-player count in one transactional operation.

## Migration phases

### Phase 1: Documentation and design

- Add this feasibility document.
- Confirm Firebase Auth is retained for v1.
- Confirm hosting migration is out of scope for the first data migration.
- Confirm whether GM account management must move to Worker immediately or can remain temporarily in Firebase Functions.

### Phase 2: Worker and D1 foundation

- Add Wrangler config with a D1 binding, for example `DB`.
- Add Drizzle Kit schema/config and generated SQL migrations under a `migrations/` directory.
- Add a Worker entrypoint with routing, JSON helpers, CORS handling, and error mapping.
- Add local development instructions for Wrangler and D1 migrations.
- Store `RECAPTCHA_SECRET_KEY` as a Worker secret.
- Store any Firebase Auth verification configuration needed by the Worker.

### Phase 3: Read API parity

- Implement public event, single event, players, games, admin check, GM profile, admin event list, GM event list, and game master list endpoints.
- Add seed data or migration fixtures.
- Add an API client while keeping current frontend function names stable.
- Switch low-risk reads first: public events and games.

### Phase 4: Write API parity

- Implement event create/update/delete, publish toggle, secret read/delete, player update/delete, game create/delete.
- Reimplement Firestore validation in shared Worker validation helpers.
- Keep frontend form behavior unchanged.

### Phase 5: Join and reCAPTCHA parity

- Move `verifyRecaptchaToken` and `joinEvent` to Worker routes.
- Implement max-player enforcement with a D1 transaction.
- Preserve the current out-of-range message: `Player limit exceeded. Please contact your Game Master`.

### Phase 6: GM account management

- Preferred final state: Worker creates, updates, disables, and deletes Firebase Auth users through Google/Firebase REST APIs and writes D1 `game_masters`.
- Lower-risk temporary state: keep the three GM account Cloud Functions until a Worker-compatible Auth administration implementation is validated.

### Phase 7: Data migration

- Export Firestore collections:
  - `admins`
  - `gameMasters`
  - `games`
  - `events`
  - `eventSecrets`
  - `events/*/players`
- Transform documents into relational rows.
- Preserve document IDs as D1 primary keys.
- Convert Firestore timestamps to UTC ISO strings.
- Convert booleans to `0`/`1`.
- Import into D1 using SQL import or batched Worker import tooling.
- Run parity checks before cutover.

### Phase 8: Cutover and cleanup

- Deploy Worker API.
- Point frontend API client to Worker.
- Run smoke tests in production.
- Disable Firestore writes in the frontend.
- Keep Firebase data read-only for a rollback window.
- Remove Firestore SDK imports and Firebase Functions calls after successful cutover.
- Delete Firebase Functions only after all routes are served by Worker.

## Data migration checklist

Before import:

- Freeze writes or schedule a short maintenance window.
- Export Firestore data.
- Count documents per collection/subcollection.
- Validate every event has `startAt`, `endAt`, `createdBy`, `gameMasterUid`, and `published`.
- Validate invite-enabled events have `maxPlayers` or default to `5`.

During transform:

- Map `gameMasters/{uid}` to `game_masters.uid`.
- Map `events/{eventId}` to `events.id`.
- Map `eventSecrets/{eventId}` to `event_secrets.event_id`.
- Map `events/{eventId}/players/{playerId}` to `event_players.id` and `event_players.event_id`.
- Lowercase admin emails.

After import:

- Compare row counts with Firestore document counts.
- Sample public calendar output from Firebase and D1 for the same date.
- Sample admin and GM event lists.
- Verify invite PINs for sampled invite-enabled events.
- Verify player counts and max-player behavior.

## Testing plan

Worker tests:

- Firebase token verification success/failure.
- Admin authorization success/failure.
- Active GM authorization success/failure.
- Event validation rejects missing fields, invalid dates, invalid colors, and invalid max players.
- GM create/update attempts cannot spoof another `created_by` or `game_master_uid`.
- Public event routes hide unpublished events.
- Player list route is public only for published invite-enabled events.
- Join route rejects bad reCAPTCHA, bad PIN, closed event, full event, and invalid names.
- Join route inserts exactly one player when valid.

Frontend tests/manual checks:

- Public calendar loads and shows player counts.
- Event info page loads public and admin/owner edit modes correctly.
- Admin login and GM login still work.
- Admin can create/edit/delete events.
- GM can create/edit/delete only their own events.
- Admin can manage games and game masters.
- Invite join flow works with reCAPTCHA and PIN.
- Player edit/delete works for admin and owner.

Build/deploy checks:

- `npm run build`
- Worker local dev with D1 binding.
- D1 migrations apply locally and remotely.
- Production Worker has required secrets and bindings.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Authorization gaps while replacing Firestore Rules | High | Centralize Worker auth helpers and test every role/path combination. |
| Firebase Auth admin operations from Workers are more complex than Cloud Functions | High | Keep GM account Cloud Functions temporarily, or implement REST-based admin operations as a separate tested phase. |
| D1 transaction behavior differs from Firestore transactions | Medium | Test join capacity under concurrent requests. Keep the transaction small. |
| Timestamp format changes break frontend sorting | Medium | Return ISO strings consistently and convert to `Date` in one API client layer. |
| CORS/session handling issues during split Firebase Hosting + Cloudflare Worker phase | Medium | Use explicit allowed origins and Authorization headers with Firebase ID tokens. |
| Query performance without indexes | Medium | Apply the listed indexes before import and test public/admin/GM query plans. |
| Rollback complexity after writes move to D1 | Medium | Keep a short write freeze for cutover, then keep Firebase read-only for rollback reference. |

## Open decisions

- Whether GM account management must be moved to Worker before the first cutover, or can remain temporarily in Cloud Functions.
- Whether to hash invite PINs during the migration or preserve plaintext first for lower migration risk.
- Whether hosting should remain on Firebase for v1 or move to Cloudflare Pages/Workers in the same project.
- Whether to add automated Worker tests before or during the first implementation phase.

## Recommendation

Proceed with a phased migration that keeps Firebase Auth, introduces a Worker API, moves data to D1, and removes Cloud Functions after route parity is complete.

Do not attempt to connect the browser directly to D1. The Worker should be treated as the replacement for both Firestore Security Rules and Cloud Functions.
