# Pub of Homies - Web App

Phase 1 foundation for the esports management platform:

- Team registration API and UI
- Solo player registration API and UI
- Admin approval/rejection API and dashboard UI
- Admin email/password login with Appwrite session cookie auth
- Admin sidebar navigation with sectioned dashboard pages
- Appwrite server-side write boundary

## Prerequisites

1. Node.js 20+
2. Appwrite Cloud project
3. Appwrite API key with database read/write scopes

## Environment Setup

Copy `.env.example` to `.env.local` and provide real Appwrite values.

Required server configuration:

- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_ADMIN_TEAM_ID` (Appwrite team ID allowed to access admin surfaces; supports comma-separated values. `APPWRITE_ADMIN_TEAM_IDS` is also supported.)
- `APPWRITE_DATABASE_ID`
- `APPWRITE_REGISTRATIONS_COLLECTION_ID`
- `APPWRITE_TEAMS_COLLECTION_ID`
- `APPWRITE_PLAYERS_COLLECTION_ID`
- `APPWRITE_FREE_AGENTS_COLLECTION_ID`
- `APPWRITE_EVENTS_COLLECTION_ID` (optional, defaults to `events`)
- `APPWRITE_MATCHES_COLLECTION_ID` (optional, defaults to `matches`)
- `APPWRITE_TEAM_STATS_COLLECTION_ID` (optional, defaults to `team_stats`)
- `APPWRITE_PLAYER_STATS_COLLECTION_ID` (optional, defaults to `player_stats`)
- `APPWRITE_MVP_COLLECTION_ID` (optional, defaults to `mvp`)
- `APPWRITE_MAPS_COLLECTION_ID` (optional, defaults to `maps`)
- `APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID` (optional, defaults to `admin_audit_logs`)
- `RIOT_API_KEY` (required for Riot sync endpoints)
- `RIOT_PLATFORM_REGION` (optional, defaults to `ap`)
- `RIOT_ROUTING_REGION` (optional, defaults to `americas`)
- `RIOT_REQUEST_TIMEOUT_MS` (optional, defaults to `10000`)
- `RIOT_MAX_RETRIES` (optional, defaults to `3`)
- `RIOT_INITIAL_BACKOFF_MS` (optional, defaults to `500`)

## Admin Login Troubleshooting

If `/api/admin/auth/login` returns a setup/configuration error:

1. In Appwrite Console -> Auth -> Settings, confirm **Email/Password** auth is enabled.
2. Confirm `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` point to the same Appwrite project where the admin user exists.
3. Confirm `APPWRITE_API_KEY` belongs to that same project and includes the scopes required by server-side admin flows (database access, team membership reads, and user session management). Admin login session creation must run through an API-key-backed server request so Appwrite returns `session.secret`.
4. Confirm the admin user is a member of one of the IDs in `APPWRITE_ADMIN_TEAM_ID` (or `APPWRITE_ADMIN_TEAM_IDS`).

If login returns **Invalid email or password**, credentials are incorrect for that Appwrite project user.

## Riot Verification File

- Production verification URL: `https://eventdb.abyssmage.fun/riot.txt`
- Keep the token file at `public/riot.txt` so Next.js serves it at `/riot.txt`.
- Keep a matching `riot.txt` at the repository root as well.

## Appwrite Data Model (Phase 1 + Phase 2)

Create tables in the configured database:

1. `registrations`
2. `teams`
3. `players`
4. `free_agents`
5. `events`
6. `matches`
7. `team_stats`
8. `player_stats`
9. `mvp`
10. `maps`
11. `admin_audit_logs`

### `registrations` (team submissions, pending approval)

- `type` (`team`)
- `status` (`pending`, `approved`, `rejected`)
- `teamName` (string)
- `captainDiscordId` (string)
- `playersJson` (longtext JSON string array of `{ name, riotId, discordId, role }`)
- `eventId` (string)
- `email` (string, optional)
- `teamLogoUrl` (string, optional)
- `teamTag` (string, optional, max 5)
- `rejectionReason` (string, optional)

### `teams` (created when team registration is approved)

- `teamName`, `captainDiscordId`, `eventId`, `playerCount`, `status`, `registrationId`
- `email`, `teamLogoUrl`, `teamTag` (optional)

### `players` (created when team registration is approved)

- `name`, `riotId`, `discordId`, `role`, `eventId`, `teamId`, `registrationId`

### `free_agents` (created directly from solo registration)

- `name`, `riotId`, `discordId`, `preferredRole`, `eventId`, `status`
- `email`, `currentRank`, `peakRank` (optional)
- `registrationId` (optional, used by admin legacy path)
- `assignedTeamId`, `assignedAt` (optional, set by admin team-builder flows)

### Query/index recommendation

- Index `registrations.status` for admin dashboard queries.
- Indexes are also provisioned for event slugs/codes, match event+time lookups,
  standings per event/team, player stat event+player lookups, MVP rankings,
  and admin audit lookups by occurred time / action / status.

## Phase 2 Event Domain Resources

- `events`: event metadata, lifecycle status, start/end and registration windows,
  plus optional registration link token/meta.
- `matches`: event-linked fixtures/results with home/away teams, played time, score,
  round differential fields (computed from score), and selected map reference (`mapRef`).
- `team_stats`: event standings aggregate (wins/losses/matches played/round diff,
  optional points).
- `player_stats`: per-match/per-map player stat rows (kills/deaths/assists) with
  required match/map refs.
- `mvp`: MVP candidate summaries and ranked scoring snapshots per event.
- `maps`: canonical Valorant map catalog for required admin stat-entry selection.

## Admin Audit Logs

- `admin_audit_logs`: server-written audit trail for sensitive admin operations.
- Fields: `actorUserId`, optional `actorEmail`, `action`, `resourceType`,
  optional `resourceId`, optional `eventId`, optional `detailsJson`, `status`,
  and `occurredAt`.
- `detailsJson` is sanitized to avoid secrets (passwords, OTP values, tokens,
  API keys, and recovery codes).

## Run

```bash
npm install
npm run dev
```

## Push Appwrite Schema

```bash
npm run schema:deploy
```

Open `http://localhost:3000`.

Use `eventId` in the register URL:

- `http://localhost:3000/register?eventId=<your-event-id>`
- Protected event links include a token:
  - `http://localhost:3000/register?eventId=<your-event-id>&token=<registration-token>`

Registration behavior:

- Registrations are accepted only when the event exists, has status `registration_open`,
  and current time is within the event registration window.
- If an event has a `registrationLinkToken`, team/solo registration must include a matching
  `token` from the registration link.
- Admins can generate/regenerate event registration links from `/dashboard/events`.

## Implemented API Endpoints

- `POST /api/register/team`
- `POST /api/register/solo`
- `GET /api/admin/registrations?status=pending|approved|rejected`
- `POST /api/admin/approve`
- `POST /api/admin/reject`
- `GET /api/admin/events?status=<event-status>&limit=<1-100>`
- `POST /api/admin/events`
- `PATCH /api/admin/events/update`
- `POST /api/admin/events/publish`
- `POST /api/admin/events/archive`
- `POST /api/admin/events/delete`
- `GET /api/admin/matches?eventId=<event-id>&status=<match-status>&limit=<1-100>`
- `POST /api/admin/matches`
- `PATCH /api/admin/matches/update`
- `GET /api/admin/maps?activeOnly=true|false&limit=<1-200>`
- `GET /api/admin/leaderboard?eventId=<event-id>&limit=<1-100>&sortBy=wins|roundDiff|points`
- `POST /api/admin/leaderboard/recompute`
- `GET /api/admin/player-stats?eventId=<event-id>&teamId=<team-id>&playerId=<player-id>&limit=<1-100>`
- `POST /api/admin/player-stats`
- `PATCH /api/admin/player-stats/update`
- `GET /api/admin/mvp?eventId=<event-id>`
- `POST /api/admin/mvp/recompute`
- `GET /api/admin/riot/config`
- `POST /api/admin/riot/sync`
- `GET /api/admin/solo-pool?eventId=<event-id>&limit=<1-200>`
- `GET /api/admin/teams/underfilled?eventId=<event-id>&limit=<1-200>`
- `GET /api/admin/teams/roster?eventId=<event-id>&limit=<1-200>`
- `POST /api/admin/teams/randomize`
- `POST /api/admin/teams/assign-solo`
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/session`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/mfa/enroll`
- `POST /api/admin/auth/mfa/enroll/verify`
- `POST /api/admin/auth/mfa/challenge`
- `POST /api/admin/auth/mfa/verify`
- `GET /api/admin/auth/mfa/recovery-codes`

Event deletion safety:

- `POST /api/admin/events/delete` requires `{ "eventId": "...", "confirmationCode": "..." }`.
- The event must already be `archived`.
- `confirmationCode` must match the event `code`.
- Deletion is cascading and removes related event-scoped records
  (matches, standings, player stats, MVP rows, teams, players, free agents, registrations).

Admin dashboard routes:

- `/admin/2fa` (required when TOTP setup or challenge is pending)
- `/dashboard`
- `/dashboard/registrations`
- `/dashboard/events`
- `/dashboard/matches`
- `/dashboard/leaderboard`
- `/dashboard/player-stats`
- `/dashboard/mvp`
- `/dashboard/riot-sync`
- `/dashboard/team-builder`
- `/dashboard/past-events` (read-only historical metadata + outcomes)
- `/dashboard/settings`
- All `/dashboard/*` routes share the same guard behavior: authenticated admin session + admin team membership + completed TOTP 2FA (otherwise redirect to `/admin/login`).

All API responses follow:

- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": "message" }`

Leaderboard notes:

- Standings are persisted in `team_stats` and can be manually recomputed per event.
- Admin match create/update endpoints trigger standings recomputation automatically.

Player stats notes:

- Player stats are persisted in `player_stats` and can be created/edited from `/dashboard/events`.
- Admin player-stats API supports event-scoped listing with optional `teamId`/`playerId` filters.
- Admin player-stats entry uses Team/Player/Match selectors; map is auto-filled and locked from the selected match.
- Match ID is shown as the primary match identifier in player-stats match selection/display.
- `matchesPlayed` and `mapsPlayed` are derived from per-row identity (not manual form inputs).
- Manual stats entry/edit remains available as a fallback even when Riot sync is unconfigured or fails.

Match notes:

- Admin match entry includes map selection and persists it on the match as `mapRef`.

MVP notes:

- MVP summaries are persisted in `mvp` and returned by `GET /api/admin/mvp`.
- Recompute with `POST /api/admin/mvp/recompute` and body `{ "eventId": "<event-id>" }`.
- Deterministic score formula:
  - `score = (2 * kills) + (1.5 * assists) - (1.25 * deaths) + (3 * matchesPlayed) + (0.5 * roundDiff) + (0.75 * points)`
- Deterministic tie-break order:
  - `score DESC`, then `kills DESC`, then `deaths ASC`, then `playerId ASC`.

Riot sync notes:

- Riot sync is admin-protected and uses bounded retries for transient Riot API failures (429/5xx).
- If `RIOT_API_KEY` is missing, Riot sync endpoints return explicit "not configured" errors.
- Trigger sync with:
  - `POST /api/admin/riot/sync`
  - Body: `{ "eventId": "<event-id>", "matchIds": ["optional-match-id"], "playerIds": ["optional-player-id"], "maxMatchesPerPlayer": 5 }`
- Check config state with:
  - `GET /api/admin/riot/config`

Team builder notes:

- Solo-player pool management is admin-protected.
- Create teams of 5 from **selected** solo players:
  - `POST /api/admin/teams/randomize`
  - Body: `{ "eventId": "<event-id>", "soloPlayerIds": ["<solo-player-id>"] }`
  - `soloPlayerIds` count must be divisible by 5.
- Assign selected solo players to an existing underfilled team:
  - `POST /api/admin/teams/assign-solo`
  - Body: `{ "eventId": "<event-id>", "teamId": "<team-id>", "soloPlayerIds": ["<solo-player-id>"] }`
  - Target team must have fewer than 5 players and enough remaining slots.

Admin audit notes:

- Logged actions include admin login/logout, MFA enroll/challenge/verify flows,
  event create/update/publish/archive/delete, match create/update, leaderboard
  recompute, player stat create/update, Riot sync trigger/results, MVP recompute,
  and registration approve/reject.
- Success/failure outcomes are recorded with concise operational context.
