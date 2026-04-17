# Pub of Homies - Web App

Phase 1 foundation for the esports management platform:

- Team registration API and UI
- Solo (free-agent) registration API and UI
- Admin approval/rejection API and dashboard UI
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
- `APPWRITE_DATABASE_ID`
- `APPWRITE_REGISTRATIONS_COLLECTION_ID`
- `APPWRITE_TEAMS_COLLECTION_ID`
- `APPWRITE_PLAYERS_COLLECTION_ID`
- `APPWRITE_FREE_AGENTS_COLLECTION_ID`

## Appwrite Data Model (Phase 1)

Create tables in the configured database:

1. `registrations`
2. `teams`
3. `players`
4. `free_agents`

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

### Query/index recommendation

- Index `registrations.status` for admin dashboard queries.

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

## Implemented API Endpoints

- `POST /api/register/team`
- `POST /api/register/solo`
- `GET /api/admin/registrations?status=pending|approved|rejected`
- `POST /api/admin/approve`
- `POST /api/admin/reject`

All API responses follow:

- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": "message" }`
