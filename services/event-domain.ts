import "server-only";

import {
  AppwriteException,
  ID,
  Query,
  type Models,
} from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import {
  mvpCandidateSchema,
  mvpSummarySchema,
  playerStatAggregateSchema,
  playerStatRecordSchema,
  teamStandingAggregateSchema,
} from "@/lib/domain/schemas";
import { HttpError } from "@/lib/errors/http-error";
import type {
  EventRegistrationLinkMeta,
  EventRecord,
  EventStatus,
  MatchRecord,
  MatchStatus,
  MvpCandidate,
  MvpSummary,
  PlayerStatAggregate,
  PlayerStatRecord,
  TeamStandingAggregate,
} from "@/lib/domain/types";

export type ListEventsOptions = {
  status?: EventStatus;
  tenantId?: string;
  organizerId?: string;
  game?: string;
  region?: string;
  format?: "single_elimination" | "double_elimination" | "league";
  visibility?: "public" | "unlisted" | "private";
  limit?: number;
};

export type ListMatchesOptions = {
  status?: MatchStatus;
  limit?: number;
};

export type StandingsSortKey = "wins" | "roundDiff" | "points";

export type ListStandingsOptions = {
  sortBy?: StandingsSortKey;
  limit?: number;
};

export type ListPlayerStatsOptions = {
  playerId?: string;
  teamId?: string;
  limit?: number;
};

type EventDocument = Models.Document & {
  tenantId?: string;
  organizerId?: string;
  game?: string;
  region?: string;
  format?: "single_elimination" | "double_elimination" | "league";
  visibility?: "public" | "unlisted" | "private";
  entryFeeMinor?: number;
  currency?: string;
  registrationMode?: "manual_approval" | "auto_approval";
  prizePoolConfigJson?: string;
  createdByUserId?: string;
  name?: string;
  slug?: string;
  code?: string;
  status?: EventStatus;
  startsAt?: string;
  endsAt?: string;
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  registrationLinkToken?: string;
  registrationLinkMeta?: string | EventRegistrationLinkMeta;
};

type MatchDocument = Models.Document & {
  eventId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  mapRef?: string;
  playedAt?: string;
  status?: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  homeRoundDiff?: number;
  awayRoundDiff?: number;
};

type TeamStandingDocument = Models.Document & {
  eventId?: string;
  teamId?: string;
  teamName?: string;
  wins?: number;
  losses?: number;
  matchesPlayed?: number;
  roundDiff?: number;
  points?: number;
};

type TeamDocument = Models.Document & {
  eventId?: string;
  teamName?: string;
};

type PlayerStatDocument = Models.Document & {
  eventId?: string;
  playerId?: string;
  teamId?: string;
  matchId?: string;
  mapRef?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  matchesPlayed?: number;
  mapsPlayed?: number;
};

type MvpDocument = Models.Document & {
  eventId?: string;
  playerId?: string;
  teamId?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  matchesPlayed?: number;
  roundDiff?: number;
  points?: number;
  score?: number;
  rank?: number;
  generatedAt?: string;
};

type TeamStandingWriteData = {
  eventId: string;
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  roundDiff: number;
  points?: number;
};

type PlayerStatWriteData = {
  eventId: string;
  playerId: string;
  teamId: string;
  matchId?: string;
  mapRef?: string;
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  mapsPlayed: number;
};

type MvpWriteData = {
  eventId: string;
  playerId: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  roundDiff: number;
  points?: number;
  score: number;
  rank: number;
  generatedAt: string;
};

type PersistedMvpCandidate = {
  candidate: MvpCandidate;
  generatedAt: string;
  documentId: string;
};

export type CreateEventInput = Omit<
  EventRecord,
  "id" | "createdAt" | "updatedAt" | "status"
> & {
  status?: EventStatus;
};

export type UpdateEventInput = Partial<
  Omit<EventRecord, "id" | "createdAt" | "updatedAt">
>;

export type CreateMatchInput = Omit<
  MatchRecord,
  "id" | "homeRoundDiff" | "awayRoundDiff"
> & {
  id?: string;
};

export type UpdateMatchInput = Partial<
  Omit<MatchRecord, "id" | "homeRoundDiff" | "awayRoundDiff" | "mapRef">
> &
  Pick<MatchRecord, "mapRef">;

export type CreatePlayerStatInput = Omit<
  PlayerStatAggregate,
  "matchesPlayed" | "mapsPlayed"
> & {
  id?: string;
};

export type UpdatePlayerStatInput = Partial<
  Omit<PlayerStatAggregate, "matchesPlayed" | "mapsPlayed">
>;

export type DeleteEventCascadeCounts = {
  matches: number;
  teamStats: number;
  playerStats: number;
  mvp: number;
  teams: number;
  players: number;
  freeAgents: number;
  registrations: number;
  events: number;
};

export type DeleteEventCascadeResult = {
  eventId: string;
  eventCode: string;
  eventName: string;
  deletedCounts: DeleteEventCascadeCounts;
};

const EVENT_STATUS_VALUES = new Set<EventStatus>([
  "draft",
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
  "archived",
]);

const PUBLISHABLE_EVENT_STATUSES = new Set<EventStatus>([
  "draft",
  "registration_closed",
]);

const MATCH_STATUS_VALUES = new Set<MatchStatus>([
  "scheduled",
  "in_progress",
  "completed",
  "forfeit",
  "cancelled",
]);

const MVP_SCORE_WEIGHTS = {
  kill: 2,
  assist: 1.5,
  death: -1.25,
  match: 3,
  roundDiff: 0.5,
  point: 0.75,
} as const;
const LEGACY_MATCH_MAP_REF = "unknown";

function isAppwriteException(error: unknown): error is AppwriteException {
  return error instanceof AppwriteException;
}

function normalizeServiceError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isAppwriteException(error)) {
    const status = error.code >= 400 && error.code <= 599 ? error.code : 500;
    return new HttpError(error.message || "Appwrite request failed.", status);
  }

  return new HttpError("Unexpected Appwrite service error.", 500);
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function normalizeIsoDatetime(
  value: string,
  fieldName: string,
  status = 400,
): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new HttpError(`${fieldName} must be a valid ISO datetime.`, status);
  }

  return new Date(timestamp).toISOString();
}

function normalizeRequiredText(
  value: unknown,
  fieldName: string,
  status = 400,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(`${fieldName} is required.`, status);
  }

  return value.trim();
}

function normalizeOptionalText(
  value: unknown,
  fieldName: string,
  status = 400,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(`${fieldName} must be a string.`, status);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function normalizeInteger(
  value: unknown,
  fieldName: string,
  status = 400,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(`${fieldName} must be an integer.`, status);
  }

  return value;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
  status = 400,
): number {
  const normalized = normalizeInteger(value, fieldName, status);
  if (normalized < 0) {
    throw new HttpError(`${fieldName} must be 0 or greater.`, status);
  }

  return normalized;
}

function ensureDifferentTeams(
  homeTeamId: string,
  awayTeamId: string,
  status = 400,
) {
  if (homeTeamId === awayTeamId) {
    throw new HttpError("Home and away teams must be different.", status);
  }
}

function ensureEventWindowsAreValid(event: {
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
}) {
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  const registrationOpensAt = Date.parse(event.registrationOpensAt);
  const registrationClosesAt = Date.parse(event.registrationClosesAt);

  if (endsAt < startsAt) {
    throw new HttpError("Event end date must be after start date.", 400);
  }

  if (registrationClosesAt < registrationOpensAt) {
    throw new HttpError(
      "Registration close must be after registration open.",
      400,
    );
  }
}

function isMetaPrimitive(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function normalizeRegistrationLinkMeta(
  value: unknown,
): EventRegistrationLinkMeta | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeRegistrationLinkMeta(parsed);
    } catch {
      throw new HttpError("Event registration link metadata is invalid JSON.", 500);
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError("Event registration link metadata has invalid shape.", 500);
  }

  const entries = Object.entries(value);
  const isValid = entries.every(([, entryValue]) => isMetaPrimitive(entryValue));

  if (!isValid) {
    throw new HttpError("Event registration link metadata has invalid values.", 500);
  }

  return Object.fromEntries(entries);
}

function serializeRegistrationLinkMeta(
  value?: EventRegistrationLinkMeta,
): string | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.stringify(value);
}

function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && EVENT_STATUS_VALUES.has(value as EventStatus);
}

function isMatchStatus(value: unknown): value is MatchStatus {
  return typeof value === "string" && MATCH_STATUS_VALUES.has(value as MatchStatus);
}

function mapEventDocument(document: EventDocument): EventRecord {
  if (
    typeof document.name !== "string" ||
    typeof document.slug !== "string" ||
    typeof document.code !== "string" ||
    typeof document.startsAt !== "string" ||
    typeof document.endsAt !== "string" ||
    typeof document.registrationOpensAt !== "string" ||
    typeof document.registrationClosesAt !== "string" ||
    !isEventStatus(document.status)
  ) {
    throw new HttpError("Event document has an invalid shape.", 500);
  }

  return {
    id: document.$id,
    tenantId: typeof document.tenantId === "string" ? document.tenantId : undefined,
    organizerId:
      typeof document.organizerId === "string" ? document.organizerId : undefined,
    game: typeof document.game === "string" ? document.game : undefined,
    region: typeof document.region === "string" ? document.region : undefined,
    format: typeof document.format === "string" ? document.format : undefined,
    visibility:
      typeof document.visibility === "string" ? document.visibility : undefined,
    entryFeeMinor:
      typeof document.entryFeeMinor === "number" ? document.entryFeeMinor : undefined,
    currency: typeof document.currency === "string" ? document.currency : undefined,
    registrationMode:
      typeof document.registrationMode === "string"
        ? document.registrationMode
        : undefined,
    prizePoolConfigJson:
      typeof document.prizePoolConfigJson === "string"
        ? document.prizePoolConfigJson
        : undefined,
    createdByUserId:
      typeof document.createdByUserId === "string" ? document.createdByUserId : undefined,
    name: document.name,
    slug: document.slug,
    code: document.code,
    status: document.status,
    startsAt: document.startsAt,
    endsAt: document.endsAt,
    registrationOpensAt: document.registrationOpensAt,
    registrationClosesAt: document.registrationClosesAt,
    registrationLinkToken:
      typeof document.registrationLinkToken === "string"
        ? document.registrationLinkToken
        : undefined,
    registrationLinkMeta: normalizeRegistrationLinkMeta(
      document.registrationLinkMeta,
    ),
    createdAt: document.$createdAt ?? null,
    updatedAt: document.$updatedAt ?? null,
  };
}

function mapMatchDocument(document: MatchDocument): MatchRecord {
  const eventId = normalizeRequiredText(document.eventId, "Match eventId", 500);
  const homeTeamId = normalizeRequiredText(document.homeTeamId, "Match homeTeamId", 500);
  const awayTeamId = normalizeRequiredText(document.awayTeamId, "Match awayTeamId", 500);
  const mapRef =
    normalizeOptionalText(document.mapRef, "Match mapRef", 500) ?? LEGACY_MATCH_MAP_REF;
  const playedAt = normalizeIsoDatetime(document.playedAt ?? "", "Match playedAt", 500);
  const homeScore = normalizeNonNegativeInteger(
    document.homeScore,
    "Match homeScore",
    500,
  );
  const awayScore = normalizeNonNegativeInteger(
    document.awayScore,
    "Match awayScore",
    500,
  );
  const homeRoundDiff = normalizeInteger(
    document.homeRoundDiff,
    "Match homeRoundDiff",
    500,
  );
  const awayRoundDiff = normalizeInteger(
    document.awayRoundDiff,
    "Match awayRoundDiff",
    500,
  );

  if (!isMatchStatus(document.status)) {
    throw new HttpError("Match status is invalid.", 500);
  }

  ensureDifferentTeams(homeTeamId, awayTeamId, 500);

  return {
    id: document.$id,
    eventId,
    homeTeamId,
    awayTeamId,
    mapRef,
    playedAt,
    status: document.status,
    homeScore,
    awayScore,
    homeRoundDiff,
    awayRoundDiff,
  };
}

function mapTeamStandingDocument(
  document: TeamStandingDocument,
): TeamStandingAggregate {
  const parsed = teamStandingAggregateSchema.safeParse({
    eventId: document.eventId,
    teamId: document.teamId,
    teamName: document.teamName,
    wins: document.wins,
    losses: document.losses,
    matchesPlayed: document.matchesPlayed,
    roundDiff: document.roundDiff,
    points: document.points,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Team standing has an invalid shape.", 500);
  }

  return parsed.data;
}

function toTeamStandingWriteData(
  standing: TeamStandingAggregate,
): TeamStandingWriteData {
  const parsed = teamStandingAggregateSchema.safeParse(standing);

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Invalid team standing payload.", 400);
  }

  if (parsed.data.points === undefined) {
    return {
      eventId: parsed.data.eventId,
      teamId: parsed.data.teamId,
      teamName: parsed.data.teamName,
      wins: parsed.data.wins,
      losses: parsed.data.losses,
      matchesPlayed: parsed.data.matchesPlayed,
      roundDiff: parsed.data.roundDiff,
    };
  }

  return parsed.data;
}

function mapPlayerStatDocument(document: PlayerStatDocument): PlayerStatRecord {
  const parsed = playerStatRecordSchema.safeParse({
    id: document.$id,
    eventId: document.eventId,
    playerId: document.playerId,
    teamId: document.teamId,
    matchId: document.matchId,
    mapRef: document.mapRef,
    kills: document.kills,
    deaths: document.deaths,
    assists: document.assists,
    matchesPlayed: document.matchesPlayed,
    mapsPlayed: document.mapsPlayed,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Player stat has an invalid shape.", 500);
  }

  return parsed.data;
}

function toPlayerStatWriteData(
  statLine: PlayerStatAggregate,
  status = 400,
): PlayerStatWriteData {
  const parsed = playerStatAggregateSchema.safeParse(statLine);

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Invalid player stat payload.", status);
  }

  return stripUndefined(parsed.data) as PlayerStatWriteData;
}

function mapMvpDocument(document: MvpDocument): PersistedMvpCandidate {
  const parsedCandidate = mvpCandidateSchema.safeParse({
    eventId: document.eventId,
    playerId: document.playerId,
    teamId: document.teamId,
    kills: document.kills,
    deaths: document.deaths,
    assists: document.assists,
    matchesPlayed: document.matchesPlayed,
    roundDiff: document.roundDiff,
    points: document.points,
    score: document.score,
    rank: document.rank,
  });

  if (!parsedCandidate.success) {
    const issue = parsedCandidate.error.issues.at(0);
    throw new HttpError(issue?.message ?? "MVP candidate has an invalid shape.", 500);
  }

  return {
    candidate: parsedCandidate.data,
    generatedAt: normalizeIsoDatetime(document.generatedAt ?? "", "MVP generatedAt", 500),
    documentId: document.$id,
  };
}

function toMvpWriteData(candidate: MvpCandidate, generatedAt: string): MvpWriteData {
  const parsedCandidate = mvpCandidateSchema.safeParse(candidate);
  if (!parsedCandidate.success) {
    const issue = parsedCandidate.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Invalid MVP candidate payload.", 400);
  }

  const normalizedGeneratedAt = normalizeIsoDatetime(generatedAt, "generatedAt");
  return {
    ...parsedCandidate.data,
    generatedAt: normalizedGeneratedAt,
  };
}

function normalizePlayerStatsLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 50;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError("Limit must be an integer between 1 and 100.", 400);
  }

  return limit;
}

function compareTextAscending(left: string, right: string): number {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (normalizedLeft === normalizedRight) {
    return 0;
  }

  return normalizedLeft < normalizedRight ? -1 : 1;
}

function compareTeamStandings(
  left: TeamStandingAggregate,
  right: TeamStandingAggregate,
  usePointsAsTertiary: boolean,
): number {
  if (left.wins !== right.wins) {
    return right.wins - left.wins;
  }

  if (left.roundDiff !== right.roundDiff) {
    return right.roundDiff - left.roundDiff;
  }

  if (usePointsAsTertiary) {
    const leftPoints = left.points ?? 0;
    const rightPoints = right.points ?? 0;
    if (leftPoints !== rightPoints) {
      return rightPoints - leftPoints;
    }
  }

  if (left.matchesPlayed !== right.matchesPlayed) {
    return left.matchesPlayed - right.matchesPlayed;
  }

  const byTeamName = compareTextAscending(left.teamName, right.teamName);
  if (byTeamName !== 0) {
    return byTeamName;
  }

  return compareTextAscending(left.teamId, right.teamId);
}

type MvpSortableCandidate = Pick<
  MvpCandidate,
  "playerId" | "teamId" | "kills" | "deaths" | "score"
>;

function compareMvpCandidates(
  left: MvpSortableCandidate,
  right: MvpSortableCandidate,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.kills !== right.kills) {
    return right.kills - left.kills;
  }

  if (left.deaths !== right.deaths) {
    return left.deaths - right.deaths;
  }

  const byPlayer = compareTextAscending(left.playerId, right.playerId);
  if (byPlayer !== 0) {
    return byPlayer;
  }

  return compareTextAscending(left.teamId, right.teamId);
}

function rankMvpCandidates(
  candidates: Array<Omit<MvpCandidate, "rank">>,
): MvpCandidate[] {
  return [...candidates]
    .sort(compareMvpCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function roundMvpScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function computeMvpScore(candidate: {
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  roundDiff: number;
  points?: number;
}): number {
  const points = candidate.points ?? 0;
  return roundMvpScore(
    candidate.kills * MVP_SCORE_WEIGHTS.kill +
      candidate.assists * MVP_SCORE_WEIGHTS.assist +
      candidate.deaths * MVP_SCORE_WEIGHTS.death +
      candidate.matchesPlayed * MVP_SCORE_WEIGHTS.match +
      candidate.roundDiff * MVP_SCORE_WEIGHTS.roundDiff +
      points * MVP_SCORE_WEIGHTS.point,
  );
}

function toStandingTeamKey(standing: { eventId: string; teamId: string }): string {
  return `${standing.eventId}:${standing.teamId}`;
}

function toMvpCandidateKey(candidate: {
  eventId: string;
  playerId: string;
  teamId: string;
}): string {
  return `${candidate.eventId}:${candidate.playerId}:${candidate.teamId}`;
}

function normalizeStatRef(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isSamePlayerStatIdentity(
  document: PlayerStatDocument,
  statLine: PlayerStatWriteData,
): boolean {
  return (
    normalizeStatRef(document.matchId) === statLine.matchId &&
    normalizeStatRef(document.mapRef) === statLine.mapRef
  );
}

async function listAllTeamStandingDocumentsByEvent(
  eventId: string,
): Promise<TeamStandingDocument[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, teamStatsCollectionId } = getAppwriteCollections();
  const documents: TeamStandingDocument[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.orderAsc("$id"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<TeamStandingDocument>(
        databaseId,
        teamStatsCollectionId,
        queries,
      );

      documents.push(...page.documents);

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return documents;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function listAllPlayerStatDocumentsByEvent(
  eventId: string,
): Promise<PlayerStatDocument[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();
  const documents: PlayerStatDocument[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.orderAsc("$id"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<PlayerStatDocument>(
        databaseId,
        playerStatsCollectionId,
        queries,
      );

      documents.push(...page.documents);

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return documents;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function listAllMvpDocumentsByEvent(eventId: string): Promise<MvpDocument[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, mvpCollectionId } = getAppwriteCollections();
  const documents: MvpDocument[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.orderAsc("rank"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<MvpDocument>(
        databaseId,
        mvpCollectionId,
        queries,
      );

      documents.push(...page.documents);

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return documents;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function listCompletedMatchesForEvent(eventId: string): Promise<MatchRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, matchesCollectionId } = getAppwriteCollections();
  const matches: MatchRecord[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.equal("status", ["completed", "forfeit"]),
        Query.orderAsc("$id"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<MatchDocument>(
        databaseId,
        matchesCollectionId,
        queries,
      );

      matches.push(...page.documents.map((document) => mapMatchDocument(document)));

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return matches;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function listTeamNamesByEvent(eventId: string): Promise<Map<string, string>> {
  const databases = getAppwriteDatabases();
  const { databaseId, teamsCollectionId } = getAppwriteCollections();
  const teamNamesById = new Map<string, string>();
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.orderAsc("$id"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<TeamDocument>(
        databaseId,
        teamsCollectionId,
        queries,
      );

      for (const teamDocument of page.documents) {
        const teamName = teamDocument.teamName?.trim();
        if (teamName) {
          teamNamesById.set(teamDocument.$id, teamName);
        }
      }

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return teamNamesById;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function listAllEventScopedDocumentIds(
  collectionId: string,
  eventId: string,
): Promise<string[]> {
  const databases = getAppwriteDatabases();
  const { databaseId } = getAppwriteCollections();
  const documentIds: string[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [
        Query.equal("eventId", eventId),
        Query.orderAsc("$id"),
        Query.limit(100),
      ];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<Models.Document>(
        databaseId,
        collectionId,
        queries,
      );
      documentIds.push(...page.documents.map((document) => document.$id));

      if (page.documents.length < 100) {
        break;
      }

      cursorAfter = page.documents.at(-1)?.$id;
      if (!cursorAfter) {
        break;
      }
    }

    return documentIds;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

async function deleteDocumentsByIds(
  collectionId: string,
  documentIds: string[],
): Promise<number> {
  if (documentIds.length === 0) {
    return 0;
  }

  const databases = getAppwriteDatabases();
  const { databaseId } = getAppwriteCollections();

  try {
    for (const documentId of documentIds) {
      await databases.deleteDocument(databaseId, collectionId, documentId);
    }

    return documentIds.length;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

function toEventWriteData(event: {
  tenantId?: string;
  organizerId?: string;
  game?: string;
  region?: string;
  format?: "single_elimination" | "double_elimination" | "league";
  visibility?: "public" | "unlisted" | "private";
  entryFeeMinor?: number;
  currency?: string;
  registrationMode?: "manual_approval" | "auto_approval";
  prizePoolConfigJson?: string;
  createdByUserId?: string;
  name: string;
  slug: string;
  code: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  registrationLinkToken?: string;
  registrationLinkMeta?: EventRegistrationLinkMeta;
}) {
  const normalizedEvent = {
    tenantId: event.tenantId?.trim() || undefined,
    organizerId: event.organizerId?.trim() || undefined,
    game: event.game?.trim() || undefined,
    region: event.region?.trim() || undefined,
    format: event.format,
    visibility: event.visibility,
    entryFeeMinor:
      typeof event.entryFeeMinor === "number" ? event.entryFeeMinor : undefined,
    currency: event.currency?.trim().toUpperCase() || undefined,
    registrationMode: event.registrationMode,
    prizePoolConfigJson: event.prizePoolConfigJson?.trim() || undefined,
    createdByUserId: event.createdByUserId?.trim() || undefined,
    name: event.name.trim(),
    slug: event.slug.trim().toLowerCase(),
    code: event.code.trim().toUpperCase(),
    status: event.status,
    startsAt: normalizeIsoDatetime(event.startsAt, "startsAt"),
    endsAt: normalizeIsoDatetime(event.endsAt, "endsAt"),
    registrationOpensAt: normalizeIsoDatetime(
      event.registrationOpensAt,
      "registrationOpensAt",
    ),
    registrationClosesAt: normalizeIsoDatetime(
      event.registrationClosesAt,
      "registrationClosesAt",
    ),
    registrationLinkToken: event.registrationLinkToken?.trim() || undefined,
    registrationLinkMeta: serializeRegistrationLinkMeta(event.registrationLinkMeta),
  };

  ensureEventWindowsAreValid(normalizedEvent);

  return stripUndefined(normalizedEvent);
}

function toMatchWriteData(match: MatchRecord) {
  const eventId = normalizeRequiredText(match.eventId, "eventId");
  const homeTeamId = normalizeRequiredText(match.homeTeamId, "homeTeamId");
  const awayTeamId = normalizeRequiredText(match.awayTeamId, "awayTeamId");
  const mapRef = normalizeRequiredText(match.mapRef, "mapRef");
  const playedAt = normalizeIsoDatetime(match.playedAt, "playedAt");
  const homeScore = normalizeNonNegativeInteger(match.homeScore, "homeScore");
  const awayScore = normalizeNonNegativeInteger(match.awayScore, "awayScore");
  const homeRoundDiff = homeScore - awayScore;
  const awayRoundDiff = awayScore - homeScore;

  if (!isMatchStatus(match.status)) {
    throw new HttpError("status is invalid.", 400);
  }

  ensureDifferentTeams(homeTeamId, awayTeamId);

  return stripUndefined({
    eventId,
    homeTeamId,
    awayTeamId,
    mapRef,
    playedAt,
    status: match.status,
    homeScore,
    awayScore,
    homeRoundDiff,
    awayRoundDiff,
  });
}

function isNotFoundError(error: unknown): boolean {
  return isAppwriteException(error) && error.code === 404;
}

async function requireEvent(eventId: string): Promise<EventRecord> {
  const existingEvent = await getEventById(eventId);
  if (!existingEvent) {
    throw new HttpError("Event not found.", 404);
  }

  return existingEvent;
}

export async function listEvents(
  options: ListEventsOptions = {},
): Promise<EventRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, eventsCollectionId } = getAppwriteCollections();
  const queryLimit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const queries = [Query.orderAsc("$createdAt"), Query.limit(queryLimit)];

  if (options.status) {
    queries.unshift(Query.equal("status", options.status));
  }
  if (options.tenantId) {
    queries.push(Query.equal("tenantId", options.tenantId));
  }
  if (options.organizerId) {
    queries.push(Query.equal("organizerId", options.organizerId));
  }
  if (options.game) {
    queries.push(Query.equal("game", options.game));
  }
  if (options.region) {
    queries.push(Query.equal("region", options.region));
  }
  if (options.format) {
    queries.push(Query.equal("format", options.format));
  }
  if (options.visibility) {
    queries.push(Query.equal("visibility", options.visibility));
  }

  try {
    const documents = await databases.listDocuments<EventDocument>(
      databaseId,
      eventsCollectionId,
      queries,
    );

    return documents.documents.map((document) => mapEventDocument(document));
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function getEventById(eventId: string): Promise<EventRecord | null> {
  const databases = getAppwriteDatabases();
  const { databaseId, eventsCollectionId } = getAppwriteCollections();

  try {
    const document = await databases.getDocument<EventDocument>(
      databaseId,
      eventsCollectionId,
      eventId,
    );

    return mapEventDocument(document);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw normalizeServiceError(error);
  }
}

export async function upsertEvent(event: EventRecord): Promise<EventRecord> {
  const databases = getAppwriteDatabases();
  const { databaseId, eventsCollectionId } = getAppwriteCollections();
  const eventData = toEventWriteData(event);

  try {
    const document = await databases.updateDocument<EventDocument>(
      databaseId,
      eventsCollectionId,
      event.id,
      eventData,
    );

    return mapEventDocument(document);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw normalizeServiceError(error);
    }
  }

  try {
    const createdDocument = await databases.createDocument<EventDocument>(
      databaseId,
      eventsCollectionId,
      event.id,
      eventData,
    );

    return mapEventDocument(createdDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function createEvent(input: CreateEventInput): Promise<EventRecord> {
  const eventId = ID.unique();

  return upsertEvent({
    id: eventId,
    tenantId: input.tenantId,
    organizerId: input.organizerId,
    game: input.game,
    region: input.region,
    format: input.format,
    visibility: input.visibility,
    entryFeeMinor: input.entryFeeMinor,
    currency: input.currency,
    registrationMode: input.registrationMode,
    prizePoolConfigJson: input.prizePoolConfigJson,
    createdByUserId: input.createdByUserId,
    name: input.name,
    slug: input.slug,
    code: input.code,
    status: input.status ?? "draft",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt,
    registrationClosesAt: input.registrationClosesAt,
    registrationLinkToken: input.registrationLinkToken,
    registrationLinkMeta: input.registrationLinkMeta,
    createdAt: null,
    updatedAt: null,
  });
}

export async function updateEvent(
  eventId: string,
  updates: UpdateEventInput,
): Promise<EventRecord> {
  const existingEvent = await requireEvent(eventId);
  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as UpdateEventInput;

  return upsertEvent({
    ...existingEvent,
    ...normalizedUpdates,
    id: existingEvent.id,
    createdAt: existingEvent.createdAt,
    updatedAt: existingEvent.updatedAt,
  });
}

export async function publishEvent(eventId: string): Promise<EventRecord> {
  const existingEvent = await requireEvent(eventId);

  if (existingEvent.status === "registration_open") {
    return existingEvent;
  }

  if (!PUBLISHABLE_EVENT_STATUSES.has(existingEvent.status)) {
    throw new HttpError(
      "Only draft or registration-closed events can be published.",
      409,
    );
  }

  return upsertEvent({ ...existingEvent, status: "registration_open" });
}

export async function archiveEvent(eventId: string): Promise<EventRecord> {
  const existingEvent = await requireEvent(eventId);

  if (existingEvent.status === "archived") {
    return existingEvent;
  }

  return upsertEvent({ ...existingEvent, status: "archived" });
}

export async function deleteArchivedEventWithCascade(
  eventId: string,
  confirmationCode: string,
): Promise<DeleteEventCascadeResult> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const normalizedConfirmationCode = normalizeRequiredText(
    confirmationCode,
    "confirmationCode",
  ).toUpperCase();
  const existingEvent = await requireEvent(normalizedEventId);
  const normalizedEventCode = normalizeRequiredText(
    existingEvent.code,
    "eventCode",
    500,
  ).toUpperCase();

  if (existingEvent.status !== "archived") {
    throw new HttpError("Only archived events can be deleted.", 409);
  }

  if (normalizedConfirmationCode !== normalizedEventCode) {
    throw new HttpError("Confirmation code does not match event code.", 409);
  }

  const {
    databaseId,
    registrationsCollectionId,
    teamsCollectionId,
    playersCollectionId,
    freeAgentsCollectionId,
    eventsCollectionId,
    matchesCollectionId,
    teamStatsCollectionId,
    playerStatsCollectionId,
    mvpCollectionId,
  } = getAppwriteCollections();
  const databases = getAppwriteDatabases();

  const [
    matchIds,
    teamStatIds,
    playerStatIds,
    mvpIds,
    teamIds,
    playerIds,
    freeAgentIds,
    registrationIds,
  ] = await Promise.all([
    listAllEventScopedDocumentIds(matchesCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(teamStatsCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(playerStatsCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(mvpCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(teamsCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(playersCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(freeAgentsCollectionId, normalizedEventId),
    listAllEventScopedDocumentIds(registrationsCollectionId, normalizedEventId),
  ]);

  const deletedCounts: DeleteEventCascadeCounts = {
    matches: 0,
    teamStats: 0,
    playerStats: 0,
    mvp: 0,
    teams: 0,
    players: 0,
    freeAgents: 0,
    registrations: 0,
    events: 0,
  };

  try {
    deletedCounts.playerStats = await deleteDocumentsByIds(
      playerStatsCollectionId,
      playerStatIds,
    );
    deletedCounts.mvp = await deleteDocumentsByIds(mvpCollectionId, mvpIds);
    deletedCounts.teamStats = await deleteDocumentsByIds(
      teamStatsCollectionId,
      teamStatIds,
    );
    deletedCounts.matches = await deleteDocumentsByIds(matchesCollectionId, matchIds);
    deletedCounts.players = await deleteDocumentsByIds(playersCollectionId, playerIds);
    deletedCounts.teams = await deleteDocumentsByIds(teamsCollectionId, teamIds);
    deletedCounts.freeAgents = await deleteDocumentsByIds(
      freeAgentsCollectionId,
      freeAgentIds,
    );
    deletedCounts.registrations = await deleteDocumentsByIds(
      registrationsCollectionId,
      registrationIds,
    );

    await databases.deleteDocument(databaseId, eventsCollectionId, normalizedEventId);
    deletedCounts.events = 1;
  } catch (error) {
    throw normalizeServiceError(error);
  }

  return {
    eventId: normalizedEventId,
    eventCode: normalizedEventCode,
    eventName: existingEvent.name,
    deletedCounts,
  };
}

export async function getMatchById(matchId: string): Promise<MatchRecord | null> {
  const databases = getAppwriteDatabases();
  const { databaseId, matchesCollectionId } = getAppwriteCollections();
  const normalizedMatchId = normalizeRequiredText(matchId, "matchId");

  try {
    const document = await databases.getDocument<MatchDocument>(
      databaseId,
      matchesCollectionId,
      normalizedMatchId,
    );

    return mapMatchDocument(document);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw normalizeServiceError(error);
  }
}

export async function listMatchesByEvent(
  eventId: string,
  options: ListMatchesOptions = {},
): Promise<MatchRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, matchesCollectionId } = getAppwriteCollections();
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const queryLimit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const queries = [
    Query.equal("eventId", normalizedEventId),
    Query.orderAsc("playedAt"),
    Query.limit(queryLimit),
  ];

  if (options.status) {
    if (!isMatchStatus(options.status)) {
      throw new HttpError("Invalid match status filter.", 400);
    }

    queries.unshift(Query.equal("status", options.status));
  }

  try {
    const documents = await databases.listDocuments<MatchDocument>(
      databaseId,
      matchesCollectionId,
      queries,
    );

    return documents.documents.map((document) => mapMatchDocument(document));
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function upsertMatch(match: MatchRecord): Promise<MatchRecord> {
  const databases = getAppwriteDatabases();
  const { databaseId, matchesCollectionId } = getAppwriteCollections();
  const normalizedMatchId = normalizeRequiredText(match.id, "matchId");
  const matchData = toMatchWriteData(match);

  try {
    const document = await databases.updateDocument<MatchDocument>(
      databaseId,
      matchesCollectionId,
      normalizedMatchId,
      matchData,
    );

    return mapMatchDocument(document);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw normalizeServiceError(error);
    }
  }

  try {
    const createdDocument = await databases.createDocument<MatchDocument>(
      databaseId,
      matchesCollectionId,
      normalizedMatchId,
      matchData,
    );

    return mapMatchDocument(createdDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function createMatch(input: CreateMatchInput): Promise<MatchRecord> {
  const matchId =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : ID.unique();

  return upsertMatch({
    id: matchId,
    eventId: input.eventId,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    mapRef: input.mapRef,
    playedAt: input.playedAt,
    status: input.status,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    homeRoundDiff: 0,
    awayRoundDiff: 0,
  });
}

export async function updateMatch(
  matchId: string,
  updates: UpdateMatchInput,
): Promise<MatchRecord> {
  const existingMatch = await getMatchById(matchId);
  if (!existingMatch) {
    throw new HttpError("Match not found.", 404);
  }

  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as UpdateMatchInput;

  if (Object.keys(normalizedUpdates).length === 0) {
    throw new HttpError("At least one match field must be provided for update.", 400);
  }

  return upsertMatch({
    ...existingMatch,
    ...normalizedUpdates,
    id: existingMatch.id,
  });
}

export async function listTeamStandingsByEvent(
  eventId: string,
  options: ListStandingsOptions = {},
): Promise<TeamStandingAggregate[]> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const queryLimit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const standingDocuments = await listAllTeamStandingDocumentsByEvent(normalizedEventId);
  const standings = standingDocuments.map((document) => mapTeamStandingDocument(document));
  const usePointsAsTertiary =
    options.sortBy === "points" ||
    standings.some((standing) => typeof standing.points === "number");

  return standings
    .sort((left, right) =>
      compareTeamStandings(left, right, usePointsAsTertiary),
    )
    .slice(0, queryLimit);
}

export async function upsertTeamStanding(
  standing: TeamStandingAggregate,
): Promise<TeamStandingAggregate> {
  const databases = getAppwriteDatabases();
  const { databaseId, teamStatsCollectionId } = getAppwriteCollections();
  const standingData = toTeamStandingWriteData(standing);

  try {
    const existing = await databases.listDocuments<TeamStandingDocument>(
      databaseId,
      teamStatsCollectionId,
      [
        Query.equal("eventId", standingData.eventId),
        Query.equal("teamId", standingData.teamId),
        Query.limit(2),
      ],
    );

    if (existing.documents.length > 1) {
      throw new HttpError(
        "Duplicate team standings found for event/team pair.",
        500,
      );
    }

    if (existing.documents.length === 1) {
      const updated = await databases.updateDocument<TeamStandingDocument>(
        databaseId,
        teamStatsCollectionId,
        existing.documents[0].$id,
        standingData,
      );

      return mapTeamStandingDocument(updated);
    }

    const created = await databases.createDocument<TeamStandingDocument>(
      databaseId,
      teamStatsCollectionId,
      ID.unique(),
      standingData,
    );

    return mapTeamStandingDocument(created);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function recomputeStandingsForEvent(
  eventId: string,
): Promise<TeamStandingAggregate[]> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  await requireEvent(normalizedEventId);

  const [matches, teamNamesById, existingStandingDocuments] = await Promise.all([
    listCompletedMatchesForEvent(normalizedEventId),
    listTeamNamesByEvent(normalizedEventId),
    listAllTeamStandingDocumentsByEvent(normalizedEventId),
  ]);

  const standingsByTeamKey = new Map<string, TeamStandingAggregate>();
  const ensureStanding = (teamId: string): TeamStandingAggregate => {
    const normalizedTeamId = normalizeRequiredText(teamId, "teamId");
    const key = toStandingTeamKey({
      eventId: normalizedEventId,
      teamId: normalizedTeamId,
    });
    const existingStanding = standingsByTeamKey.get(key);
    if (existingStanding) {
      return existingStanding;
    }

    const nextStanding: TeamStandingAggregate = {
      eventId: normalizedEventId,
      teamId: normalizedTeamId,
      teamName: teamNamesById.get(normalizedTeamId) ?? normalizedTeamId,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      roundDiff: 0,
      points: 0,
    };
    standingsByTeamKey.set(key, nextStanding);
    return nextStanding;
  };

  for (const match of matches) {
    const homeStanding = ensureStanding(match.homeTeamId);
    const awayStanding = ensureStanding(match.awayTeamId);

    homeStanding.matchesPlayed += 1;
    awayStanding.matchesPlayed += 1;

    homeStanding.roundDiff += match.homeRoundDiff;
    awayStanding.roundDiff += match.awayRoundDiff;

    if (match.homeScore > match.awayScore) {
      homeStanding.wins += 1;
      awayStanding.losses += 1;
    } else if (match.awayScore > match.homeScore) {
      awayStanding.wins += 1;
      homeStanding.losses += 1;
    }

    homeStanding.points = homeStanding.wins * 3;
    awayStanding.points = awayStanding.wins * 3;
  }

  const computedStandings = Array.from(standingsByTeamKey.values()).sort((left, right) =>
    compareTeamStandings(left, right, true),
  );
  const computedTeamIds = new Set(computedStandings.map((standing) => standing.teamId));
  const databases = getAppwriteDatabases();
  const { databaseId, teamStatsCollectionId } = getAppwriteCollections();
  const existingDocumentsByTeamId = new Map<string, TeamStandingDocument>();
  const retainedDocumentIds = new Set<string>();

  for (const existingDocument of existingStandingDocuments) {
    const teamId = normalizeRequiredText(
      existingDocument.teamId,
      "Team standing teamId",
      500,
    );
    if (!existingDocumentsByTeamId.has(teamId)) {
      existingDocumentsByTeamId.set(teamId, existingDocument);
      retainedDocumentIds.add(existingDocument.$id);
    }
  }

  try {
    const persistedStandings: TeamStandingAggregate[] = [];

    for (const standing of computedStandings) {
      const existingDocument = existingDocumentsByTeamId.get(standing.teamId);
      const standingData = toTeamStandingWriteData(standing);

      const persistedDocument = existingDocument
        ? await databases.updateDocument<TeamStandingDocument>(
            databaseId,
            teamStatsCollectionId,
            existingDocument.$id,
            standingData,
          )
        : await databases.createDocument<TeamStandingDocument>(
            databaseId,
            teamStatsCollectionId,
            ID.unique(),
            standingData,
          );

      persistedStandings.push(mapTeamStandingDocument(persistedDocument));
    }

    for (const existingDocument of existingStandingDocuments) {
      if (!retainedDocumentIds.has(existingDocument.$id)) {
        await databases.deleteDocument(
          databaseId,
          teamStatsCollectionId,
          existingDocument.$id,
        );
        continue;
      }

      const existingTeamId = normalizeRequiredText(
        existingDocument.teamId,
        "Team standing teamId",
        500,
      );

      if (computedTeamIds.has(existingTeamId)) {
        continue;
      }

      await databases.deleteDocument(
        databaseId,
        teamStatsCollectionId,
        existingDocument.$id,
      );
    }

    return persistedStandings.sort((left, right) =>
      compareTeamStandings(left, right, true),
    );
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function listPlayerStatsByEvent(
  eventId: string,
  options: ListPlayerStatsOptions = {},
): Promise<PlayerStatRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const normalizedPlayerId = normalizeOptionalText(options.playerId, "playerId");
  const normalizedTeamId = normalizeOptionalText(options.teamId, "teamId");
  const queryLimit = normalizePlayerStatsLimit(options.limit);
  const queries = [
    Query.equal("eventId", normalizedEventId),
    Query.orderAsc("$id"),
    Query.limit(queryLimit),
  ];

  if (options.playerId !== undefined && !normalizedPlayerId) {
    throw new HttpError("playerId cannot be empty.", 400);
  }

  if (options.teamId !== undefined && !normalizedTeamId) {
    throw new HttpError("teamId cannot be empty.", 400);
  }

  if (normalizedPlayerId) {
    queries.push(Query.equal("playerId", normalizedPlayerId));
  }

  if (normalizedTeamId) {
    queries.push(Query.equal("teamId", normalizedTeamId));
  }

  try {
    const documents = await databases.listDocuments<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      queries,
    );

    return documents.documents.map((document) => mapPlayerStatDocument(document));
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function upsertPlayerStat(
  statLine: PlayerStatAggregate,
): Promise<PlayerStatRecord> {
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();
  const statData = toPlayerStatWriteData(statLine);

  try {
    const existing = await databases.listDocuments<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      [
        Query.equal("eventId", statData.eventId),
        Query.equal("playerId", statData.playerId),
        Query.equal("teamId", statData.teamId),
        Query.limit(100),
      ],
    );
    const matchingDocuments = existing.documents.filter((document) =>
      isSamePlayerStatIdentity(document, statData),
    );

    if (matchingDocuments.length > 1) {
      throw new HttpError(
        "Duplicate player stats found for event/player/team/match/map identity.",
        500,
      );
    }

    if (matchingDocuments.length === 1) {
      const updated = await databases.updateDocument<PlayerStatDocument>(
        databaseId,
        playerStatsCollectionId,
        matchingDocuments[0].$id,
        statData,
      );

      return mapPlayerStatDocument(updated);
    }

    const created = await databases.createDocument<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      ID.unique(),
      statData,
    );

    return mapPlayerStatDocument(created);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function getPlayerStatById(
  playerStatId: string,
): Promise<PlayerStatRecord | null> {
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();
  const normalizedPlayerStatId = normalizeRequiredText(playerStatId, "playerStatId");

  try {
    const document = await databases.getDocument<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      normalizedPlayerStatId,
    );

    return mapPlayerStatDocument(document);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw normalizeServiceError(error);
  }
}

export async function createPlayerStat(
  input: CreatePlayerStatInput,
): Promise<PlayerStatRecord> {
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();
  const playerStatId =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : ID.unique();
  const normalizedMatchId = normalizeRequiredText(input.matchId ?? "", "matchId");
  const normalizedMapRef = normalizeRequiredText(input.mapRef ?? "", "mapRef");
  const statData = toPlayerStatWriteData({
    ...input,
    matchId: normalizedMatchId,
    mapRef: normalizedMapRef,
    matchesPlayed: 1,
    mapsPlayed: 1,
  });

  try {
    const created = await databases.createDocument<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      playerStatId,
      statData,
    );

    return mapPlayerStatDocument(created);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function updatePlayerStat(
  playerStatId: string,
  updates: UpdatePlayerStatInput,
): Promise<PlayerStatRecord> {
  const normalizedPlayerStatId = normalizeRequiredText(playerStatId, "playerStatId");
  const existingPlayerStat = await getPlayerStatById(normalizedPlayerStatId);
  if (!existingPlayerStat) {
    throw new HttpError("Player stat not found.", 404);
  }

  const normalizedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as UpdatePlayerStatInput;

  if (Object.keys(normalizedUpdates).length === 0) {
    throw new HttpError(
      "At least one player stat field must be provided for update.",
      400,
    );
  }

  const existingStatLine: PlayerStatAggregate = {
    eventId: existingPlayerStat.eventId,
    playerId: existingPlayerStat.playerId,
    teamId: existingPlayerStat.teamId,
    matchId: existingPlayerStat.matchId,
    mapRef: existingPlayerStat.mapRef,
    kills: existingPlayerStat.kills,
    deaths: existingPlayerStat.deaths,
    assists: existingPlayerStat.assists,
    matchesPlayed: 1,
    mapsPlayed: 1,
  };
  const nextMatchId = normalizeRequiredText(
    normalizedUpdates.matchId ?? existingStatLine.matchId ?? "",
    "matchId",
  );
  const nextMapRef = normalizeRequiredText(
    normalizedUpdates.mapRef ?? existingStatLine.mapRef ?? "",
    "mapRef",
  );
  const nextStatData = toPlayerStatWriteData({
    ...existingStatLine,
    ...normalizedUpdates,
    matchId: nextMatchId,
    mapRef: nextMapRef,
    matchesPlayed: 1,
    mapsPlayed: 1,
  });
  const databases = getAppwriteDatabases();
  const { databaseId, playerStatsCollectionId } = getAppwriteCollections();

  try {
    const updated = await databases.updateDocument<PlayerStatDocument>(
      databaseId,
      playerStatsCollectionId,
      normalizedPlayerStatId,
      nextStatData,
    );

    return mapPlayerStatDocument(updated);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function listMvpCandidatesByEvent(
  eventId: string,
): Promise<MvpCandidate[]> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const mvpDocuments = await listAllMvpDocumentsByEvent(normalizedEventId);
  const candidates = mvpDocuments
    .map((document) => mapMvpDocument(document).candidate)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return compareMvpCandidates(left, right);
    });

  return candidates;
}

export async function getMvpSummaryByEvent(
  eventId: string,
): Promise<MvpSummary | null> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const persistedCandidates = (await listAllMvpDocumentsByEvent(normalizedEventId)).map(
    (document) => mapMvpDocument(document),
  );

  if (persistedCandidates.length === 0) {
    return null;
  }

  const generatedAtValues = new Set(
    persistedCandidates.map((candidate) => candidate.generatedAt),
  );
  if (generatedAtValues.size > 1) {
    throw new HttpError(
      "MVP summary is inconsistent: multiple generatedAt values found for event.",
      500,
    );
  }

  const generatedAt = persistedCandidates[0].generatedAt;
  const candidates = persistedCandidates
    .map((candidate) => candidate.candidate)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return compareMvpCandidates(left, right);
    });

  const parsedSummary = mvpSummarySchema.safeParse({
    eventId: normalizedEventId,
    generatedAt,
    topCandidate: candidates[0],
    candidates,
  });

  if (!parsedSummary.success) {
    const issue = parsedSummary.error.issues.at(0);
    throw new HttpError(issue?.message ?? "MVP summary has an invalid shape.", 500);
  }

  return parsedSummary.data;
}

export async function upsertMvpSummary(summary: MvpSummary): Promise<MvpSummary> {
  const parsedSummary = mvpSummarySchema.safeParse(summary);
  if (!parsedSummary.success) {
    const issue = parsedSummary.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Invalid MVP summary payload.", 400);
  }

  const normalizedEventId = normalizeRequiredText(parsedSummary.data.eventId, "eventId");
  const normalizedGeneratedAt = normalizeIsoDatetime(
    parsedSummary.data.generatedAt,
    "generatedAt",
  );
  const candidatesWithoutRank = parsedSummary.data.candidates.map((candidate) => {
    if (candidate.eventId !== normalizedEventId) {
      throw new HttpError("All MVP candidates must match summary eventId.", 400);
    }

    return {
      eventId: normalizedEventId,
      playerId: candidate.playerId,
      teamId: candidate.teamId,
      kills: candidate.kills,
      deaths: candidate.deaths,
      assists: candidate.assists,
      matchesPlayed: candidate.matchesPlayed,
      roundDiff: candidate.roundDiff,
      points: candidate.points,
      score: candidate.score,
    };
  });
  const rankedCandidates = rankMvpCandidates(candidatesWithoutRank);
  const summaryToPersist: MvpSummary = {
    eventId: normalizedEventId,
    generatedAt: normalizedGeneratedAt,
    topCandidate: rankedCandidates[0],
    candidates: rankedCandidates,
  };
  const candidateKeySet = new Set<string>();

  for (const candidate of rankedCandidates) {
    const key = toMvpCandidateKey(candidate);
    if (candidateKeySet.has(key)) {
      throw new HttpError(
        "Duplicate MVP candidates found for event/player/team identity.",
        400,
      );
    }
    candidateKeySet.add(key);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, mvpCollectionId } = getAppwriteCollections();
  const existingDocuments = await listAllMvpDocumentsByEvent(normalizedEventId);
  const existingByCandidateKey = new Map<string, MvpDocument>();

  for (const existingDocument of existingDocuments) {
    const mapped = mapMvpDocument(existingDocument).candidate;
    const key = toMvpCandidateKey(mapped);
    if (existingByCandidateKey.has(key)) {
      throw new HttpError(
        "Duplicate MVP documents found for event/player/team identity.",
        500,
      );
    }
    existingByCandidateKey.set(key, existingDocument);
  }

  const retainedDocumentIds = new Set<string>();

  try {
    for (const candidate of rankedCandidates) {
      const candidateKey = toMvpCandidateKey(candidate);
      const writeData = toMvpWriteData(candidate, normalizedGeneratedAt);
      const existingDocument = existingByCandidateKey.get(candidateKey);

      if (existingDocument) {
        retainedDocumentIds.add(existingDocument.$id);
        await databases.updateDocument<MvpDocument>(
          databaseId,
          mvpCollectionId,
          existingDocument.$id,
          writeData,
        );
        continue;
      }

      const created = await databases.createDocument<MvpDocument>(
        databaseId,
        mvpCollectionId,
        ID.unique(),
        writeData,
      );
      retainedDocumentIds.add(created.$id);
    }

    for (const existingDocument of existingDocuments) {
      if (retainedDocumentIds.has(existingDocument.$id)) {
        continue;
      }

      await databases.deleteDocument(
        databaseId,
        mvpCollectionId,
        existingDocument.$id,
      );
    }
  } catch (error) {
    throw normalizeServiceError(error);
  }

  return summaryToPersist;
}

export async function generateMvpSummaryForEvent(eventId: string): Promise<MvpSummary> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  await requireEvent(normalizedEventId);

  const [playerStats, standingDocuments] = await Promise.all([
    listAllPlayerStatDocumentsByEvent(normalizedEventId),
    listAllTeamStandingDocumentsByEvent(normalizedEventId),
  ]);
  const standingsByTeamId = new Map<string, TeamStandingAggregate>(
    standingDocuments
      .map((document) => mapTeamStandingDocument(document))
      .map((standing) => [standing.teamId, standing]),
  );
  const candidateInputsByKey = new Map<
    string,
    {
      eventId: string;
      playerId: string;
      teamId: string;
      kills: number;
      deaths: number;
      assists: number;
      matchRefs: Set<string>;
    }
  >();

  for (const playerStatDocument of playerStats) {
    const playerStat = mapPlayerStatDocument(playerStatDocument);
    const key = toMvpCandidateKey(playerStat);
    const existing = candidateInputsByKey.get(key);
    const matchRef = normalizeStatRef(playerStat.matchId) ?? `row:${playerStat.id}`;

    if (existing) {
      existing.kills += playerStat.kills;
      existing.deaths += playerStat.deaths;
      existing.assists += playerStat.assists;
      existing.matchRefs.add(matchRef);
      continue;
    }

    candidateInputsByKey.set(key, {
      eventId: normalizedEventId,
      playerId: playerStat.playerId,
      teamId: playerStat.teamId,
      kills: playerStat.kills,
      deaths: playerStat.deaths,
      assists: playerStat.assists,
      matchRefs: new Set([matchRef]),
    });
  }

  const rankedCandidates = rankMvpCandidates(
    Array.from(candidateInputsByKey.values()).map((candidate) => {
      const standing = standingsByTeamId.get(candidate.teamId);
      const roundDiff = standing?.roundDiff ?? 0;
      const points = standing?.points;
      const matchesPlayed = candidate.matchRefs.size;

      return {
        eventId: candidate.eventId,
        playerId: candidate.playerId,
        teamId: candidate.teamId,
        kills: candidate.kills,
        deaths: candidate.deaths,
        assists: candidate.assists,
        matchesPlayed,
        roundDiff,
        points,
        score: computeMvpScore({
          kills: candidate.kills,
          deaths: candidate.deaths,
          assists: candidate.assists,
          matchesPlayed,
          roundDiff,
          points,
        }),
      };
    }),
  );

  const summary = {
    eventId: normalizedEventId,
    generatedAt: new Date().toISOString(),
    topCandidate: rankedCandidates[0],
    candidates: rankedCandidates,
  };
  const parsedSummary = mvpSummarySchema.safeParse(summary);

  if (!parsedSummary.success) {
    const issue = parsedSummary.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Generated MVP summary has invalid shape.", 500);
  }

  return parsedSummary.data;
}

export async function recomputeMvpSummaryForEvent(eventId: string): Promise<MvpSummary> {
  const summary = await generateMvpSummaryForEvent(eventId);
  return upsertMvpSummary(summary);
}
