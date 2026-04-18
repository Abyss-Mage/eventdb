import "server-only";

import {
  AppwriteException,
  ID,
  Query,
  type Models,
} from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { HttpError } from "@/lib/errors/http-error";
import type {
  BracketRecord,
  MatchRecord,
  MatchStatus,
  TournamentFormat,
} from "@/lib/domain/types";
import {
  getEventById,
  recomputeStandingsForEvent,
  upsertMatch,
} from "@/services/event-domain";
import { listApprovedTeamRostersByEvent } from "@/services/registrations";

type BracketState = BracketRecord["state"];

type BracketDocument = Models.Document & {
  tenantId?: string;
  organizerId?: string;
  eventId?: string;
  format?: TournamentFormat;
  version?: number;
  state?: BracketState;
  structureJson?: string;
  generatedByUserId?: string;
  publishedAt?: string;
};

type SeededTeam = {
  teamId: string;
  teamName: string;
  seed: number;
};

type MatchSource =
  | { kind: "seed"; seed: number; teamId?: string }
  | { kind: "match"; matchId: string; outcome: "winner" | "loser" };

type MatchTarget = {
  matchId: string;
  slot: "home" | "away";
};

type BracketMatch = {
  id: string;
  stage: "upper" | "lower" | "grand_final" | "league";
  round: number;
  sequence: number;
  bestOf: number;
  homeTeamId?: string;
  awayTeamId?: string;
  homeSource?: MatchSource;
  awaySource?: MatchSource;
  winnerTo?: MatchTarget;
  loserTo?: MatchTarget;
  ifNecessary?: boolean;
};

type BracketStructure = {
  format: TournamentFormat;
  generatedAt: string;
  seededTeams: SeededTeam[];
  metadata: {
    teamCount: number;
    bracketSize?: number;
    roundCount: number;
    maxTeams: number;
  };
  matches: BracketMatch[];
  status?: BracketStatusMetadata;
};

type GenerateBracketOptions = {
  state?: "draft" | "published";
};

type BracketResultStatus = Extract<MatchStatus, "completed" | "forfeit">;

type BracketMatchResult = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string;
  loserTeamId?: string;
  status: BracketResultStatus;
  submittedByUserId: string;
  submittedAt: string;
};

type BracketStatusMetadata = {
  completedMatchIds: string[];
  resultsByMatchId: Record<string, BracketMatchResult>;
  updatedAt: string;
};

type ProgressionUpdate = {
  matchId: string;
  slot: "home" | "away";
  teamId: string;
  source: "winner" | "loser";
};

type MatchSyncResult = {
  syncedMatchId?: string;
  standingsRecomputed: boolean;
  matchSyncError?: string;
};

export type SubmitBracketResultInput = {
  eventId: string;
  bracketId?: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  status?: BracketResultStatus;
  submittedByUserId: string;
};

export type SubmitBracketResultResult = MatchSyncResult & {
  bracket: BracketRecord;
  matchId: string;
  winnerTeamId: string;
  loserTeamId?: string;
  status: BracketResultStatus;
  progressionUpdates: ProgressionUpdate[];
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const FORMAT_LIMITS: Record<TournamentFormat, { minTeams: number; maxTeams: number }> = {
  single_elimination: { minTeams: 2, maxTeams: 64 },
  double_elimination: { minTeams: 4, maxTeams: 32 },
  league: { minTeams: 2, maxTeams: 20 },
};

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

function normalizeRequiredText(value: unknown, fieldName: string, status = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(`${fieldName} is required.`, status);
  }

  return value.trim();
}

function normalizePositiveInteger(value: unknown, fieldName: string, status = 500): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new HttpError(`${fieldName} must be a positive integer.`, status);
  }

  return value;
}

function normalizeNonNegativeInteger(value: unknown, fieldName: string, status = 400): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(`${fieldName} must be a non-negative integer.`, status);
  }

  return value;
}

function normalizeOptionalText(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizeRequiredText(value, fieldName);
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function computeNextPowerOfTwo(size: number): number {
  let value = 1;
  while (value < size) {
    value *= 2;
  }
  return value;
}

function createLegacyScopeValue(prefix: string, eventId: string): string {
  const normalizedEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `${prefix}_${normalizedEventId}`.slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTournamentFormat(value: unknown): value is TournamentFormat {
  return (
    value === "single_elimination" ||
    value === "double_elimination" ||
    value === "league"
  );
}

function isBracketResultStatus(value: unknown): value is BracketResultStatus {
  return value === "completed" || value === "forfeit";
}

function isMatchSource(value: unknown): value is MatchSource {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "seed") {
    return (
      typeof value.seed === "number" &&
      Number.isInteger(value.seed) &&
      value.seed > 0 &&
      (value.teamId === undefined || typeof value.teamId === "string")
    );
  }

  if (value.kind === "match") {
    return (
      typeof value.matchId === "string" &&
      value.matchId.trim().length > 0 &&
      (value.outcome === "winner" || value.outcome === "loser")
    );
  }

  return false;
}

function isMatchTarget(value: unknown): value is MatchTarget {
  return (
    isRecord(value) &&
    typeof value.matchId === "string" &&
    value.matchId.trim().length > 0 &&
    (value.slot === "home" || value.slot === "away")
  );
}

function isBracketMatch(value: unknown): value is BracketMatch {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    (value.stage === "upper" ||
      value.stage === "lower" ||
      value.stage === "grand_final" ||
      value.stage === "league") &&
    typeof value.round === "number" &&
    Number.isInteger(value.round) &&
    value.round >= 1 &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 1 &&
    typeof value.bestOf === "number" &&
    Number.isInteger(value.bestOf) &&
    value.bestOf >= 1 &&
    (value.homeTeamId === undefined || typeof value.homeTeamId === "string") &&
    (value.awayTeamId === undefined || typeof value.awayTeamId === "string") &&
    (value.homeSource === undefined || isMatchSource(value.homeSource)) &&
    (value.awaySource === undefined || isMatchSource(value.awaySource)) &&
    (value.winnerTo === undefined || isMatchTarget(value.winnerTo)) &&
    (value.loserTo === undefined || isMatchTarget(value.loserTo)) &&
    (value.ifNecessary === undefined || typeof value.ifNecessary === "boolean")
  );
}

function isBracketMatchResult(value: unknown): value is BracketMatchResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.matchId === "string" &&
    value.matchId.trim().length > 0 &&
    typeof value.homeScore === "number" &&
    Number.isInteger(value.homeScore) &&
    value.homeScore >= 0 &&
    typeof value.awayScore === "number" &&
    Number.isInteger(value.awayScore) &&
    value.awayScore >= 0 &&
    typeof value.winnerTeamId === "string" &&
    value.winnerTeamId.trim().length > 0 &&
    (value.loserTeamId === undefined || typeof value.loserTeamId === "string") &&
    isBracketResultStatus(value.status) &&
    typeof value.submittedByUserId === "string" &&
    value.submittedByUserId.trim().length > 0 &&
    typeof value.submittedAt === "string"
  );
}

function isBracketStatusMetadata(value: unknown): value is BracketStatusMetadata {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !Array.isArray(value.completedMatchIds) ||
    !value.completedMatchIds.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    )
  ) {
    return false;
  }

  if (!isRecord(value.resultsByMatchId)) {
    return false;
  }

  const resultEntries = Object.values(value.resultsByMatchId);
  if (!resultEntries.every((entry) => isBracketMatchResult(entry))) {
    return false;
  }

  return typeof value.updatedAt === "string";
}

function parseBracketStructure(structureJson: string): BracketStructure {
  let parsed: unknown;

  try {
    parsed = JSON.parse(structureJson);
  } catch {
    throw new HttpError("Bracket structure JSON is invalid.", 500);
  }

  if (!isRecord(parsed)) {
    throw new HttpError("Bracket structure must be an object.", 500);
  }

  if (!isTournamentFormat(parsed.format)) {
    throw new HttpError("Bracket structure format is invalid.", 500);
  }

  if (typeof parsed.generatedAt !== "string") {
    throw new HttpError("Bracket structure generatedAt is invalid.", 500);
  }

  if (!Array.isArray(parsed.seededTeams)) {
    throw new HttpError("Bracket structure seededTeams is invalid.", 500);
  }

  if (
    !parsed.seededTeams.every((team) => {
      if (!isRecord(team)) {
        return false;
      }

      return (
        typeof team.teamId === "string" &&
        team.teamId.trim().length > 0 &&
        typeof team.teamName === "string" &&
        team.teamName.trim().length > 0 &&
        typeof team.seed === "number" &&
        Number.isInteger(team.seed) &&
        team.seed > 0
      );
    })
  ) {
    throw new HttpError("Bracket structure seededTeams payload is invalid.", 500);
  }

  if (
    !isRecord(parsed.metadata) ||
    typeof parsed.metadata.teamCount !== "number" ||
    !Number.isInteger(parsed.metadata.teamCount) ||
    parsed.metadata.teamCount < 0 ||
    typeof parsed.metadata.roundCount !== "number" ||
    !Number.isInteger(parsed.metadata.roundCount) ||
    parsed.metadata.roundCount < 1 ||
    typeof parsed.metadata.maxTeams !== "number" ||
    !Number.isInteger(parsed.metadata.maxTeams) ||
    parsed.metadata.maxTeams < 1 ||
    (parsed.metadata.bracketSize !== undefined &&
      (typeof parsed.metadata.bracketSize !== "number" ||
        !Number.isInteger(parsed.metadata.bracketSize) ||
        parsed.metadata.bracketSize < 2))
  ) {
    throw new HttpError("Bracket structure metadata is invalid.", 500);
  }

  if (!Array.isArray(parsed.matches) || !parsed.matches.every((match) => isBracketMatch(match))) {
    throw new HttpError("Bracket structure matches payload is invalid.", 500);
  }

  if (parsed.status !== undefined && !isBracketStatusMetadata(parsed.status)) {
    throw new HttpError("Bracket structure status metadata is invalid.", 500);
  }

  return parsed as BracketStructure;
}

function ensureStatusMetadata(
  structure: BracketStructure,
  updatedAt: string,
): BracketStatusMetadata {
  if (structure.status) {
    return structure.status;
  }

  const nextStatus: BracketStatusMetadata = {
    completedMatchIds: [],
    resultsByMatchId: {},
    updatedAt,
  };
  structure.status = nextStatus;
  return nextStatus;
}

function normalizeBracketResultStatus(value: unknown): BracketResultStatus {
  if (value === undefined) {
    return "completed";
  }

  if (isBracketResultStatus(value)) {
    return value;
  }

  throw new HttpError("Bracket result status must be completed or forfeit.", 400);
}

function buildBracketMatchDocumentId(bracketId: string, matchId: string): string {
  const normalized = `${bracketId}__${matchId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (normalized.length <= 64) {
    return normalized;
  }

  const prefix = normalized.slice(0, 55);
  const hash = Buffer.from(normalized).toString("base64url").slice(0, 8);
  return `${prefix}_${hash}`;
}

function buildBracketMatchMapRef(bracketId: string): string {
  return `bracket:${bracketId}`.slice(0, 64);
}

function mapBracketDocument(document: BracketDocument): BracketRecord {
  const eventId = normalizeRequiredText(document.eventId, "Bracket eventId");
  return {
    id: document.$id,
    tenantId:
      typeof document.tenantId === "string" && document.tenantId.trim().length > 0
        ? document.tenantId
        : createLegacyScopeValue("legacy_tenant", eventId),
    organizerId:
      typeof document.organizerId === "string" && document.organizerId.trim().length > 0
        ? document.organizerId
        : createLegacyScopeValue("legacy_organizer", eventId),
    eventId,
    format: document.format ?? "single_elimination",
    version: normalizePositiveInteger(document.version, "Bracket version"),
    state: document.state ?? "draft",
    structureJson: normalizeRequiredText(document.structureJson, "Bracket structureJson"),
    generatedByUserId: normalizeRequiredText(
      document.generatedByUserId,
      "Bracket generatedByUserId",
    ),
    publishedAt: document.publishedAt,
    createdAt: document.$createdAt ?? null,
    updatedAt: document.$updatedAt ?? null,
  };
}

function buildSeededTeams(
  teams: Array<{ id: string; teamName: string }>,
): SeededTeam[] {
  return teams.map((team, index) => ({
    teamId: team.id,
    teamName: team.teamName,
    seed: index + 1,
  }));
}

function createEmptyMatch(
  stage: BracketMatch["stage"],
  round: number,
  sequence: number,
): BracketMatch {
  const prefix =
    stage === "upper"
      ? "UB"
      : stage === "lower"
        ? "LB"
        : stage === "grand_final"
          ? "GF"
          : "LG";
  return {
    id: `${prefix}-R${round}-M${sequence}`,
    stage,
    round,
    sequence,
    bestOf: stage === "grand_final" ? 5 : 3,
  };
}

function buildUpperBracket(
  seededTeams: SeededTeam[],
): { rounds: BracketMatch[][]; bracketSize: number } {
  const bracketSize = computeNextPowerOfTwo(seededTeams.length);
  const upperRoundsCount = Math.log2(bracketSize);
  const rounds: BracketMatch[][] = [];

  const seedSlots: Array<SeededTeam | null> = Array.from({ length: bracketSize }, (_, index) =>
    seededTeams[index] ?? null,
  );

  const firstRoundMatches = bracketSize / 2;
  const roundOne: BracketMatch[] = [];
  for (let matchIndex = 0; matchIndex < firstRoundMatches; matchIndex += 1) {
    const homeSeed = seedSlots[matchIndex * 2];
    const awaySeed = seedSlots[matchIndex * 2 + 1];
    const match = createEmptyMatch("upper", 1, matchIndex + 1);
    if (homeSeed) {
      match.homeTeamId = homeSeed.teamId;
      match.homeSource = { kind: "seed", seed: homeSeed.seed, teamId: homeSeed.teamId };
    }
    if (awaySeed) {
      match.awayTeamId = awaySeed.teamId;
      match.awaySource = { kind: "seed", seed: awaySeed.seed, teamId: awaySeed.teamId };
    }
    roundOne.push(match);
  }
  rounds.push(roundOne);

  for (let round = 2; round <= upperRoundsCount; round += 1) {
    const matchCount = bracketSize / 2 ** round;
    const currentRound: BracketMatch[] = [];
    for (let sequence = 1; sequence <= matchCount; sequence += 1) {
      const homeParent = rounds[round - 2][sequence * 2 - 2];
      const awayParent = rounds[round - 2][sequence * 2 - 1];
      const match = createEmptyMatch("upper", round, sequence);
      match.homeSource = { kind: "match", matchId: homeParent.id, outcome: "winner" };
      match.awaySource = { kind: "match", matchId: awayParent.id, outcome: "winner" };
      homeParent.winnerTo = { matchId: match.id, slot: "home" };
      awayParent.winnerTo = { matchId: match.id, slot: "away" };
      currentRound.push(match);
    }
    rounds.push(currentRound);
  }

  return { rounds, bracketSize };
}

function buildSingleEliminationStructure(seededTeams: SeededTeam[]): BracketStructure {
  const { rounds, bracketSize } = buildUpperBracket(seededTeams);
  return {
    format: "single_elimination",
    generatedAt: new Date().toISOString(),
    seededTeams,
    metadata: {
      teamCount: seededTeams.length,
      bracketSize,
      roundCount: rounds.length,
      maxTeams: FORMAT_LIMITS.single_elimination.maxTeams,
    },
    matches: rounds.flat(),
  };
}

function buildDoubleEliminationStructure(seededTeams: SeededTeam[]): BracketStructure {
  const { rounds: upperRounds, bracketSize } = buildUpperBracket(seededTeams);
  const upperRoundsCount = upperRounds.length;
  const lowerRoundsCount = upperRoundsCount > 1 ? (upperRoundsCount - 1) * 2 : 0;
  const lowerRounds: BracketMatch[][] = [];

  if (lowerRoundsCount > 0) {
    const lowerRoundOneCount = bracketSize / 4;
    const lowerRoundOne: BracketMatch[] = [];
    for (let sequence = 1; sequence <= lowerRoundOneCount; sequence += 1) {
      const upperLoserA = upperRounds[0][sequence * 2 - 2];
      const upperLoserB = upperRounds[0][sequence * 2 - 1];
      const match = createEmptyMatch("lower", 1, sequence);
      match.homeSource = { kind: "match", matchId: upperLoserA.id, outcome: "loser" };
      match.awaySource = { kind: "match", matchId: upperLoserB.id, outcome: "loser" };
      upperLoserA.loserTo = { matchId: match.id, slot: "home" };
      upperLoserB.loserTo = { matchId: match.id, slot: "away" };
      lowerRoundOne.push(match);
    }
    lowerRounds.push(lowerRoundOne);

    for (let bracketStep = 1; bracketStep < upperRoundsCount; bracketStep += 1) {
      const evenRoundNumber = bracketStep * 2;
      const evenRoundCount = bracketSize / 2 ** (bracketStep + 1);
      const previousRound = lowerRounds[evenRoundNumber - 2];
      const upperLoserRound = upperRounds[bracketStep];
      const evenRoundMatches: BracketMatch[] = [];

      for (let sequence = 1; sequence <= evenRoundCount; sequence += 1) {
        const lowerWinnerMatch = previousRound[sequence - 1];
        const upperLoserMatch = upperLoserRound[sequence - 1];
        const match = createEmptyMatch("lower", evenRoundNumber, sequence);
        match.homeSource = { kind: "match", matchId: lowerWinnerMatch.id, outcome: "winner" };
        match.awaySource = { kind: "match", matchId: upperLoserMatch.id, outcome: "loser" };
        lowerWinnerMatch.winnerTo = { matchId: match.id, slot: "home" };
        upperLoserMatch.loserTo = { matchId: match.id, slot: "away" };
        evenRoundMatches.push(match);
      }
      lowerRounds.push(evenRoundMatches);

      const isFinalLowerRound = bracketStep === upperRoundsCount - 1;
      if (isFinalLowerRound) {
        continue;
      }

      const oddRoundNumber = evenRoundNumber + 1;
      const oddRoundCount = bracketSize / 2 ** (bracketStep + 2);
      const oddRoundMatches: BracketMatch[] = [];
      for (let sequence = 1; sequence <= oddRoundCount; sequence += 1) {
        const previousMatchA = evenRoundMatches[sequence * 2 - 2];
        const previousMatchB = evenRoundMatches[sequence * 2 - 1];
        const match = createEmptyMatch("lower", oddRoundNumber, sequence);
        match.homeSource = { kind: "match", matchId: previousMatchA.id, outcome: "winner" };
        match.awaySource = { kind: "match", matchId: previousMatchB.id, outcome: "winner" };
        previousMatchA.winnerTo = { matchId: match.id, slot: "home" };
        previousMatchB.winnerTo = { matchId: match.id, slot: "away" };
        oddRoundMatches.push(match);
      }
      lowerRounds.push(oddRoundMatches);
    }
  }

  const upperFinal = upperRounds.at(-1)?.[0];
  const lowerFinal = lowerRounds.at(-1)?.[0];
  if (!upperFinal || !lowerFinal) {
    throw new HttpError("Unable to generate a valid double-elimination bracket graph.", 500);
  }

  const grandFinal = createEmptyMatch("grand_final", 1, 1);
  grandFinal.homeSource = { kind: "match", matchId: upperFinal.id, outcome: "winner" };
  grandFinal.awaySource = { kind: "match", matchId: lowerFinal.id, outcome: "winner" };

  const grandFinalReset = createEmptyMatch("grand_final", 2, 1);
  grandFinalReset.ifNecessary = true;
  grandFinalReset.homeSource = { kind: "match", matchId: grandFinal.id, outcome: "winner" };
  grandFinalReset.awaySource = { kind: "match", matchId: grandFinal.id, outcome: "loser" };

  upperFinal.winnerTo = { matchId: grandFinal.id, slot: "home" };
  lowerFinal.winnerTo = { matchId: grandFinal.id, slot: "away" };
  grandFinal.winnerTo = { matchId: grandFinalReset.id, slot: "home" };
  grandFinal.loserTo = { matchId: grandFinalReset.id, slot: "away" };

  return {
    format: "double_elimination",
    generatedAt: new Date().toISOString(),
    seededTeams,
    metadata: {
      teamCount: seededTeams.length,
      bracketSize,
      roundCount: upperRounds.length + lowerRounds.length + 2,
      maxTeams: FORMAT_LIMITS.double_elimination.maxTeams,
    },
    matches: [...upperRounds.flat(), ...lowerRounds.flat(), grandFinal, grandFinalReset],
  };
}

function rotateRoundRobinParticipants<T>(participants: T[]): T[] {
  if (participants.length <= 2) {
    return participants.slice();
  }

  const [anchor, ...rest] = participants;
  const last = rest.at(-1);
  if (last === undefined) {
    return participants.slice();
  }

  return [anchor, last, ...rest.slice(0, -1)];
}

function buildLeagueStructure(seededTeams: SeededTeam[]): BracketStructure {
  const slots: Array<SeededTeam | null> = seededTeams.slice();
  if (slots.length % 2 !== 0) {
    slots.push(null);
  }

  let participants = slots;
  const roundsCount = participants.length - 1;
  const matchesPerRound = participants.length / 2;
  const matches: BracketMatch[] = [];

  for (let round = 1; round <= roundsCount; round += 1) {
    for (let sequence = 1; sequence <= matchesPerRound; sequence += 1) {
      const home = participants[sequence - 1];
      const away = participants[participants.length - sequence];
      if (!home || !away) {
        continue;
      }

      const match = createEmptyMatch("league", round, sequence);
      match.bestOf = 3;
      match.homeTeamId = home.teamId;
      match.awayTeamId = away.teamId;
      match.homeSource = { kind: "seed", seed: home.seed, teamId: home.teamId };
      match.awaySource = { kind: "seed", seed: away.seed, teamId: away.teamId };
      matches.push(match);
    }

    participants = rotateRoundRobinParticipants(participants);
  }

  return {
    format: "league",
    generatedAt: new Date().toISOString(),
    seededTeams,
    metadata: {
      teamCount: seededTeams.length,
      roundCount: roundsCount,
      maxTeams: FORMAT_LIMITS.league.maxTeams,
    },
    matches,
  };
}

function buildBracketStructure(
  format: TournamentFormat,
  seededTeams: SeededTeam[],
): BracketStructure {
  if (format === "single_elimination") {
    return buildSingleEliminationStructure(seededTeams);
  }
  if (format === "double_elimination") {
    return buildDoubleEliminationStructure(seededTeams);
  }
  return buildLeagueStructure(seededTeams);
}

async function getNextVersion(eventId: string): Promise<number> {
  const databases = getAppwriteDatabases();
  const { databaseId, bracketsCollectionId } = getAppwriteCollections();

  const page = await databases.listDocuments<BracketDocument>(databaseId, bracketsCollectionId, [
    Query.equal("eventId", eventId),
    Query.orderDesc("version"),
    Query.limit(1),
  ]);

  const latest = page.documents[0]?.version;
  const latestVersion =
    typeof latest === "number" && Number.isInteger(latest) && latest >= 1 ? latest : null;
  if (latestVersion === null) {
    return 1;
  }

  return latestVersion + 1;
}

export async function listBracketsByEvent(
  eventId: string,
  limit = DEFAULT_LIST_LIMIT,
): Promise<BracketRecord[]> {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new HttpError(`Limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`, 400);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, bracketsCollectionId } = getAppwriteCollections();

  try {
    const documents = await databases.listDocuments<BracketDocument>(
      databaseId,
      bracketsCollectionId,
      [
        Query.equal("eventId", normalizedEventId),
        Query.orderDesc("version"),
        Query.limit(limit),
      ],
    );
    return documents.documents.map(mapBracketDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function getLatestBracketByEvent(
  eventId: string,
): Promise<BracketRecord | null> {
  const brackets = await listBracketsByEvent(eventId, 1);
  return brackets[0] ?? null;
}

export async function generateBracketForEvent(
  eventId: string,
  generatedByUserId: string,
  options?: GenerateBracketOptions,
): Promise<BracketRecord> {
  const normalizedEventId = eventId.trim();
  const normalizedActorId = generatedByUserId.trim();
  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }
  if (!normalizedActorId) {
    throw new HttpError("Generator user ID is required.", 400);
  }

  const event = await getEventById(normalizedEventId);
  if (!event) {
    throw new HttpError("Event not found.", 404);
  }

  const format = event.format;
  if (format !== "single_elimination" && format !== "double_elimination" && format !== "league") {
    throw new HttpError(
      "Event format is required before generating a bracket.",
      409,
    );
  }

  const approvedTeams = await listApprovedTeamRostersByEvent(normalizedEventId, 200);
  const uniqueTeams = new Map<string, { id: string; teamName: string }>();
  for (const team of approvedTeams) {
    if (!uniqueTeams.has(team.id)) {
      uniqueTeams.set(team.id, { id: team.id, teamName: team.teamName });
    }
  }

  const teams = Array.from(uniqueTeams.values());
  const limits = FORMAT_LIMITS[format];
  if (teams.length < limits.minTeams) {
    throw new HttpError(
      `At least ${limits.minTeams} approved teams are required for ${format.replace("_", " ")}.`,
      409,
    );
  }
  if (teams.length > limits.maxTeams) {
    throw new HttpError(
      `${format.replace("_", " ")} supports at most ${limits.maxTeams} teams in the current MVP bracket engine.`,
      409,
    );
  }

  const seededTeams = buildSeededTeams(teams);
  const structure = buildBracketStructure(format, seededTeams);
  const version = await getNextVersion(normalizedEventId);
  const desiredState: "draft" | "published" = options?.state ?? "draft";
  const now = new Date().toISOString();

  const tenantId =
    event.tenantId && event.tenantId.trim().length > 0
      ? event.tenantId
      : createLegacyScopeValue("legacy_tenant", normalizedEventId);
  const organizerId =
    event.organizerId && event.organizerId.trim().length > 0
      ? event.organizerId
      : createLegacyScopeValue("legacy_organizer", normalizedEventId);

  const databases = getAppwriteDatabases();
  const { databaseId, bracketsCollectionId } = getAppwriteCollections();

  try {
    const document = await databases.createDocument<BracketDocument>(
      databaseId,
      bracketsCollectionId,
      ID.unique(),
      stripUndefined({
        tenantId,
        organizerId,
        eventId: normalizedEventId,
        format,
        version,
        state: desiredState,
        structureJson: JSON.stringify(structure),
        generatedByUserId: normalizedActorId,
        publishedAt: desiredState === "published" ? now : undefined,
      }),
    );
    return mapBracketDocument(document);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}
