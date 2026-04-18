import "server-only";

import { createHash } from "node:crypto";

import { Query, type Models } from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { HttpError } from "@/lib/errors/http-error";
import type { MatchRecord, PlayerStatAggregate } from "@/lib/domain/types";
import {
  getEventById,
  recomputeStandingsForEvent,
  upsertMatch,
  upsertPlayerStat,
} from "@/services/event-domain";
import {
  getRiotConfigStatus,
  getRiotMatchById,
  listRiotMatchIdsByPuuid,
  parseRiotId,
  resolveRiotAccountByRiotId,
  type RiotMatch,
} from "@/services/riot";

type PlayerDocument = Models.Document & {
  eventId?: string;
  teamId?: string;
  riotId?: string;
  name?: string;
};

type EventPlayer = {
  id: string;
  name: string;
  eventId: string;
  teamId: string;
  riotId: string;
  riotIdKey?: string;
};

type SyncPlayerScope = {
  playerIds?: string[];
  matchIds?: string[];
  maxMatchesPerPlayer?: number;
};

type ResolvedPlayer = EventPlayer & {
  puuid: string;
};

type TeamAssignment = {
  riotTeamId: string;
  internalTeamId: string;
  roundsWon: number;
};

export type RiotSyncResult = {
  eventId: string;
  requestedMatchCount: number;
  processedMatchCount: number;
  upsertedMatches: number;
  upsertedPlayerStats: number;
  skippedMatchCount: number;
  standingsCount: number;
  warnings: string[];
};

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

function normalizeRiotIdKey(riotId: string): string {
  const { gameName, tagLine } = parseRiotId(riotId);
  return `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
}

function toDeterministicMatchId(riotMatchId: string): string {
  const hash = createHash("sha256").update(riotMatchId).digest("hex").slice(0, 40);
  return `riot_${hash}`;
}

function mapPlayerDocument(document: PlayerDocument): EventPlayer {
  const riotId = normalizeRequiredText(document.riotId, "Player riotId", 500);
  let riotIdKey: string | undefined;

  try {
    riotIdKey = normalizeRiotIdKey(riotId);
  } catch {
    riotIdKey = undefined;
  }

  return {
    id: document.$id,
    name: normalizeRequiredText(document.name, "Player name", 500),
    eventId: normalizeRequiredText(document.eventId, "Player eventId", 500),
    teamId: normalizeRequiredText(document.teamId, "Player teamId", 500),
    riotId,
    riotIdKey,
  };
}

async function listPlayersByEvent(eventId: string): Promise<EventPlayer[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, playersCollectionId } = getAppwriteCollections();
  const players: EventPlayer[] = [];
  let cursorAfter: string | undefined;

  while (true) {
    const queries = [
      Query.equal("eventId", eventId),
      Query.orderAsc("$id"),
      Query.limit(100),
    ];

    if (cursorAfter) {
      queries.push(Query.cursorAfter(cursorAfter));
    }

    const page = await databases.listDocuments<PlayerDocument>(
      databaseId,
      playersCollectionId,
      queries,
    );

    players.push(...page.documents.map((document) => mapPlayerDocument(document)));

    if (page.documents.length < 100) {
      break;
    }

    cursorAfter = page.documents.at(-1)?.$id;
    if (!cursorAfter) {
      break;
    }
  }

  return players;
}

function filterPlayersByScope(
  players: EventPlayer[],
  scope: SyncPlayerScope,
): EventPlayer[] {
  if (!scope.playerIds || scope.playerIds.length === 0) {
    return players;
  }

  const playerIds = new Set(scope.playerIds.map((playerId) => playerId.trim()));
  const filtered = players.filter((player) => playerIds.has(player.id));

  if (filtered.length === 0) {
    throw new HttpError("No matching players found for the provided playerIds.", 404);
  }

  const missingPlayerIds = Array.from(playerIds).filter(
    (playerId) => !filtered.some((player) => player.id === playerId),
  );
  if (missingPlayerIds.length > 0) {
    throw new HttpError(
      `Unknown playerIds in scope: ${missingPlayerIds.join(", ")}`,
      400,
    );
  }

  return filtered;
}

async function resolvePlayers(
  players: EventPlayer[],
  warnings: string[],
): Promise<ResolvedPlayer[]> {
  const resolved: ResolvedPlayer[] = [];

  for (const player of players) {
    try {
      const account = await resolveRiotAccountByRiotId(player.riotId);
      resolved.push({
        ...player,
        puuid: account.puuid,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unknown account lookup error.";
      warnings.push(
        `Unable to resolve Riot account for ${player.name} (${player.riotId}): ${message}`,
      );
    }
  }

  return resolved;
}

async function collectMatchIds(
  resolvedPlayers: ResolvedPlayer[],
  scope: SyncPlayerScope,
): Promise<string[]> {
  if (scope.matchIds && scope.matchIds.length > 0) {
    return Array.from(
      new Set(
        scope.matchIds
          .map((matchId) => matchId.trim())
          .filter((matchId) => matchId.length > 0),
      ),
    );
  }

  const maxMatchesPerPlayer = Math.min(Math.max(scope.maxMatchesPerPlayer ?? 5, 1), 20);
  const matchIds = new Set<string>();

  for (const player of resolvedPlayers) {
    const playerMatchIds = await listRiotMatchIdsByPuuid(player.puuid, {
      size: maxMatchesPerPlayer,
    });

    for (const matchId of playerMatchIds) {
      matchIds.add(matchId);
    }
  }

  return Array.from(matchIds);
}

function buildTeamAssignments(
  match: RiotMatch,
  playerByPuuid: Map<string, ResolvedPlayer>,
): TeamAssignment[] {
  const countsByRiotTeam = new Map<string, Map<string, number>>();

  for (const player of match.players) {
    const resolvedPlayer = playerByPuuid.get(player.puuid);
    if (!resolvedPlayer) {
      continue;
    }

    const current = countsByRiotTeam.get(player.riotTeamId) ?? new Map<string, number>();
    const nextCount = (current.get(resolvedPlayer.teamId) ?? 0) + 1;
    current.set(resolvedPlayer.teamId, nextCount);
    countsByRiotTeam.set(player.riotTeamId, current);
  }

  const assignments: TeamAssignment[] = [];
  for (const team of match.teams) {
    const counts = countsByRiotTeam.get(team.riotTeamId);
    if (!counts || counts.size === 0) {
      throw new HttpError(
        `Unable to map Riot team ${team.riotTeamId} to an internal event team.`,
        422,
      );
    }

    const sortedCounts = Array.from(counts.entries()).sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    });

    if (sortedCounts[0] && sortedCounts[1] && sortedCounts[0][1] === sortedCounts[1][1]) {
      throw new HttpError(
        `Ambiguous team mapping for Riot team ${team.riotTeamId}.`,
        422,
      );
    }

    assignments.push({
      riotTeamId: team.riotTeamId,
      internalTeamId: sortedCounts[0][0],
      roundsWon: team.roundsWon,
    });
  }

  const uniqueTeamIds = new Set(assignments.map((assignment) => assignment.internalTeamId));
  if (uniqueTeamIds.size < 2) {
    throw new HttpError("Riot match mapped to fewer than two internal teams.", 422);
  }

  return assignments;
}

function toMatchRecord(
  eventId: string,
  match: RiotMatch,
  assignments: TeamAssignment[],
): MatchRecord {
  const [home, away] = assignments;

  if (!home || !away) {
    throw new HttpError("Riot match does not include two teams.", 422);
  }

  if (home.internalTeamId === away.internalTeamId) {
    throw new HttpError("Mapped match teams cannot be identical.", 422);
  }

  return {
    id: toDeterministicMatchId(match.riotMatchId),
    eventId,
    homeTeamId: home.internalTeamId,
    awayTeamId: away.internalTeamId,
    mapRef: "unknown",
    playedAt: match.startedAt,
    status: match.isCompleted ? "completed" : "in_progress",
    homeScore: home.roundsWon,
    awayScore: away.roundsWon,
    homeRoundDiff: home.roundsWon - away.roundsWon,
    awayRoundDiff: away.roundsWon - home.roundsWon,
  };
}

function findPlayerByIdentity(
  riotPlayer: RiotMatch["players"][number],
  playerByPuuid: Map<string, ResolvedPlayer>,
  playerByRiotIdKey: Map<string, EventPlayer>,
): EventPlayer | null {
  const byPuuid = playerByPuuid.get(riotPlayer.puuid);
  if (byPuuid) {
    return byPuuid;
  }

  if (!riotPlayer.gameName || !riotPlayer.tagLine) {
    return null;
  }

  const riotIdKey = `${riotPlayer.gameName.toLowerCase()}#${riotPlayer.tagLine.toLowerCase()}`;
  return playerByRiotIdKey.get(riotIdKey) ?? null;
}

function toPlayerStatPayload(
  eventId: string,
  matchId: string,
  player: EventPlayer,
  riotPlayer: RiotMatch["players"][number],
): PlayerStatAggregate {
  return {
    eventId,
    playerId: player.id,
    teamId: player.teamId,
    matchId,
    kills: riotPlayer.kills,
    deaths: riotPlayer.deaths,
    assists: riotPlayer.assists,
    matchesPlayed: 1,
    mapsPlayed: 1,
  };
}

export function getRiotSyncConfigStatus() {
  return getRiotConfigStatus();
}

export async function syncRiotEventData(
  eventId: string,
  scope: SyncPlayerScope = {},
): Promise<RiotSyncResult> {
  const normalizedEventId = normalizeRequiredText(eventId, "eventId");
  const config = getRiotConfigStatus();

  if (!config.configured) {
    throw new HttpError(
      "Riot integration is not configured. Set RIOT_API_KEY.",
      503,
    );
  }

  if (!(await getEventById(normalizedEventId))) {
    throw new HttpError("Event not found.", 404);
  }

  const eventPlayers = await listPlayersByEvent(normalizedEventId);
  if (eventPlayers.length === 0) {
    throw new HttpError(
      "No event players found. Approve registrations before running Riot sync.",
      409,
    );
  }

  const scopedPlayers = filterPlayersByScope(eventPlayers, scope);
  const warnings: string[] = [];
  const resolvedPlayers = await resolvePlayers(scopedPlayers, warnings);
  const playerByPuuid = new Map(resolvedPlayers.map((player) => [player.puuid, player]));
  const playerByRiotIdKey = new Map(
    scopedPlayers
      .filter((player) => Boolean(player.riotIdKey))
      .map((player) => [player.riotIdKey as string, player]),
  );
  const matchIds = await collectMatchIds(resolvedPlayers, scope);

  if (matchIds.length === 0) {
    throw new HttpError(
      "No Riot match IDs available for sync. Provide matchIds or ensure players have recent match history.",
      422,
    );
  }

  let upsertedMatches = 0;
  let upsertedPlayerStats = 0;
  let skippedMatchCount = 0;
  const processedMatchIds: string[] = [];

  for (const riotMatchId of matchIds) {
    try {
      const riotMatch = await getRiotMatchById(riotMatchId);
      const assignments = buildTeamAssignments(riotMatch, playerByPuuid);
      const matchRecord = toMatchRecord(normalizedEventId, riotMatch, assignments);
      const assignmentByRiotTeam = new Map(
        assignments.map((assignment) => [assignment.riotTeamId, assignment]),
      );

      await upsertMatch(matchRecord);
      upsertedMatches += 1;
      processedMatchIds.push(riotMatch.riotMatchId);

      for (const riotPlayer of riotMatch.players) {
        const eventPlayer = findPlayerByIdentity(
          riotPlayer,
          playerByPuuid,
          playerByRiotIdKey,
        );
        if (!eventPlayer) {
          continue;
        }

        const teamAssignment = assignmentByRiotTeam.get(riotPlayer.riotTeamId);
        if (!teamAssignment) {
          continue;
        }

        if (teamAssignment.internalTeamId !== eventPlayer.teamId) {
          warnings.push(
            `Skipped player ${eventPlayer.id} for match ${riotMatch.riotMatchId} due to team mismatch.`,
          );
          continue;
        }

        await upsertPlayerStat(
          toPlayerStatPayload(
            normalizedEventId,
            matchRecord.id,
            eventPlayer,
            riotPlayer,
          ),
        );
        upsertedPlayerStats += 1;
      }
    } catch (error) {
      skippedMatchCount += 1;
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unknown match sync error.";
      warnings.push(`Skipped Riot match ${riotMatchId}: ${message}`);
    }
  }

  if (upsertedMatches === 0) {
    const firstWarning = warnings[0] ?? "No match data could be normalized.";
    throw new HttpError(`Riot sync did not persist any matches. ${firstWarning}`, 422);
  }

  const standings = await recomputeStandingsForEvent(normalizedEventId);

  return {
    eventId: normalizedEventId,
    requestedMatchCount: matchIds.length,
    processedMatchCount: processedMatchIds.length,
    upsertedMatches,
    upsertedPlayerStats,
    skippedMatchCount,
    standingsCount: standings.length,
    warnings,
  };
}
