import "server-only";

import {
  AppwriteException,
  type Databases,
  ID,
  Query,
  type Models,
} from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { HttpError } from "@/lib/errors/http-error";
import type {
  ApprovedTeamRosterRecord,
  EventRecord,
  RandomTeamCreationSummary,
  RegistrationRecord,
  RegistrationStatus,
  SoloPlayerAssignmentSummary,
  SoloRegistrationInput,
  SoloPlayerPoolRecord,
  SoloPlayerStatus,
  TeamRosterPlayerRecord,
  TeamPlayerInput,
  TeamRegistrationInput,
  UnderfilledTeamRecord,
} from "@/lib/domain/types";
import { getEventById } from "@/services/event-domain";

type RegistrationDocument = Models.Document & {
  type: "team" | "solo";
  status: RegistrationStatus;
  rejectionReason?: string;
  teamName?: string;
  captainDiscordId?: string;
  eventId?: string;
  email?: string;
  teamLogoUrl?: string;
  teamTag?: string;
  playersJson?: string;
  players?: TeamPlayerInput[];
  player?: SoloRegistrationInput;
};

type FreeAgentDocument = Models.Document & {
  name: string;
  riotId: string;
  discordId: string;
  preferredRole: TeamPlayerInput["role"];
  eventId: string;
  status: SoloPlayerStatus;
  email?: string;
  currentRank?: SoloRegistrationInput["currentRank"];
  peakRank?: SoloRegistrationInput["peakRank"];
  registrationId?: string;
  assignedTeamId?: string;
  assignedAt?: string;
};

type TeamDocument = Models.Document & {
  teamName: string;
  captainDiscordId: string;
  eventId: string;
  playerCount: number;
  status?: string;
  registrationId?: string;
  email?: string;
  teamLogoUrl?: string;
  teamTag?: string;
};

type PlayerDocument = Models.Document & {
  name: string;
  riotId: string;
  discordId: string;
  role: TeamPlayerInput["role"];
  eventId: string;
  teamId: string;
  registrationId?: string;
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

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

async function ensureDocument(
  databases: Databases,
  databaseId: string,
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await databases.getDocument(databaseId, collectionId, documentId);
    return;
  } catch (error) {
    if (isAppwriteException(error) && error.code === 404) {
      await databases.createDocument(
        databaseId,
        collectionId,
        documentId,
        stripUndefined(data),
      );
      return;
    }

    throw normalizeServiceError(error);
  }
}

function isTeamRegistrationDocument(
  data: RegistrationDocument,
): data is RegistrationDocument & {
  type: "team";
  teamName: string;
  captainDiscordId: string;
  eventId: string;
} {
  return (
    data.type === "team" &&
    typeof data.teamName === "string" &&
    typeof data.captainDiscordId === "string" &&
    typeof data.eventId === "string"
  );
}

function isLegacySoloRegistrationDocument(
  data: RegistrationDocument,
): data is RegistrationDocument & {
  type: "solo";
  player: SoloRegistrationInput;
} {
  return data.type === "solo" && typeof data.player === "object" && data.player !== null;
}

function mapRegistrationDocument(
  id: string,
  data: RegistrationDocument,
): RegistrationRecord {
  if (!isTeamRegistrationDocument(data)) {
    throw new HttpError("Registration document has an invalid shape.", 500);
  }

  const players = parsePlayers(data);

  return {
    id,
    type: "team",
    status: data.status,
    submittedAt: data.$createdAt ?? null,
    updatedAt: data.$updatedAt ?? null,
    rejectionReason: data.rejectionReason,
    teamName: data.teamName,
    captainDiscordId: data.captainDiscordId,
    eventId: data.eventId,
    email: data.email,
    teamLogoUrl: data.teamLogoUrl,
    teamTag: data.teamTag,
    players,
  };
}

function isTeamPlayerInput(value: unknown): value is TeamPlayerInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const roleValues = new Set([
    "duelist",
    "initiator",
    "controller",
    "sentinel",
    "flex",
  ]);

  return (
    typeof candidate.name === "string" &&
    typeof candidate.riotId === "string" &&
    typeof candidate.discordId === "string" &&
    typeof candidate.role === "string" &&
    roleValues.has(candidate.role)
  );
}

function parsePlayers(data: RegistrationDocument): TeamPlayerInput[] {
  if (Array.isArray(data.players) && data.players.every(isTeamPlayerInput)) {
    return data.players;
  }

  if (typeof data.playersJson === "string") {
    try {
      const parsed = JSON.parse(data.playersJson);
      if (Array.isArray(parsed) && parsed.every(isTeamPlayerInput)) {
        return parsed;
      }
    } catch {
      throw new HttpError("Registration players payload is invalid JSON.", 500);
    }
  }

  throw new HttpError("Registration document has invalid player data.", 500);
}

function normalizeToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRegistrationWindowOpen(event: EventRecord, currentTime: number): boolean {
  const opensAt = Date.parse(event.registrationOpensAt);
  const closesAt = Date.parse(event.registrationClosesAt);

  if (Number.isNaN(opensAt) || Number.isNaN(closesAt)) {
    throw new HttpError("Event registration window is misconfigured.", 500);
  }

  return currentTime >= opensAt && currentTime <= closesAt;
}

async function ensureRegistrationAllowed(
  eventId: string,
  registrationToken?: string,
): Promise<void> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new HttpError("Event not found.", 404);
  }

  if (event.status !== "registration_open") {
    throw new HttpError("Registration is not open for this event right now.", 409);
  }

  if (!isRegistrationWindowOpen(event, Date.now())) {
    throw new HttpError("Registration is closed for this event at the moment.", 409);
  }

  const configuredToken = normalizeToken(event.registrationLinkToken);
  if (!configuredToken) {
    return;
  }

  if (normalizeToken(registrationToken) !== configuredToken) {
    throw new HttpError("This registration link is invalid for the selected event.", 403);
  }
}

export async function createTeamRegistration(
  payload: TeamRegistrationInput,
): Promise<string> {
  const databases = getAppwriteDatabases();
  const { databaseId, registrationsCollectionId } = getAppwriteCollections();

  try {
    await ensureRegistrationAllowed(payload.eventId, payload.registrationToken);

    const document = await databases.createDocument(
      databaseId,
      registrationsCollectionId,
      ID.unique(),
      stripUndefined({
        type: "team",
        status: "pending",
        teamName: payload.teamName,
        captainDiscordId: payload.captainDiscordId,
        playersJson: JSON.stringify(payload.players),
        eventId: payload.eventId,
        email: payload.email,
        teamLogoUrl: payload.teamLogoUrl,
        teamTag: payload.teamTag,
      }),
    );

    return document.$id;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function createSoloRegistration(
  payload: SoloRegistrationInput,
): Promise<string> {
  const databases = getAppwriteDatabases();
  const { databaseId, freeAgentsCollectionId } = getAppwriteCollections();

  try {
    await ensureRegistrationAllowed(payload.eventId, payload.registrationToken);

    const document = await databases.createDocument(
      databaseId,
      freeAgentsCollectionId,
      ID.unique(),
      stripUndefined({
        name: payload.name,
        riotId: payload.riotId,
        discordId: payload.discordId,
        preferredRole: payload.preferredRole,
        eventId: payload.eventId,
        status: "available",
        email: payload.email,
        currentRank: payload.currentRank,
        peakRank: payload.peakRank,
      }),
    );

    return document.$id;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function listRegistrationsByStatus(
  status: RegistrationStatus,
  limit = 50,
): Promise<RegistrationRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, registrationsCollectionId } = getAppwriteCollections();

  try {
    const documents = await databases.listDocuments<RegistrationDocument>(
      databaseId,
      registrationsCollectionId,
      [Query.equal("status", status), Query.orderAsc("$createdAt"), Query.limit(limit)],
    );

    return documents.documents.map((document) =>
      mapRegistrationDocument(document.$id, document),
    );
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function approveRegistration(registrationId: string): Promise<void> {
  const databases = getAppwriteDatabases();
  const {
    databaseId,
    registrationsCollectionId,
    teamsCollectionId,
    playersCollectionId,
    freeAgentsCollectionId,
  } = getAppwriteCollections();

  try {
    const registration = await databases.getDocument<RegistrationDocument>(
      databaseId,
      registrationsCollectionId,
      registrationId,
    );

    if (registration.status !== "pending") {
      throw new HttpError("Only pending registrations can be approved.", 409);
    }

    if (isTeamRegistrationDocument(registration)) {
      const registrationPlayers = parsePlayers(registration);
      const teamDocumentId = `team_${registrationId}`;
      await ensureDocument(databases, databaseId, teamsCollectionId, teamDocumentId, {
        teamName: registration.teamName,
        captainDiscordId: registration.captainDiscordId,
        eventId: registration.eventId,
        email: registration.email,
        teamLogoUrl: registration.teamLogoUrl,
        teamTag: registration.teamTag,
        playerCount: registrationPlayers.length,
        status: "approved",
        registrationId,
      });

      for (const [index, player] of registrationPlayers.entries()) {
        await ensureDocument(
          databases,
          databaseId,
          playersCollectionId,
          `player_${registrationId}_${index + 1}`,
          {
            name: player.name,
            riotId: player.riotId,
            discordId: player.discordId,
            role: player.role,
            eventId: registration.eventId,
            teamId: teamDocumentId,
            registrationId,
          },
        );
      }
    } else if (isLegacySoloRegistrationDocument(registration)) {
      await ensureDocument(
        databases,
        databaseId,
        freeAgentsCollectionId,
        `free_agent_${registrationId}`,
        {
          name: registration.player.name,
          riotId: registration.player.riotId,
          discordId: registration.player.discordId,
          preferredRole: registration.player.preferredRole,
          eventId: registration.player.eventId,
          status: "available",
          email: registration.player.email,
          currentRank: registration.player.currentRank,
          peakRank: registration.player.peakRank,
          registrationId,
        },
      );
    } else {
      throw new HttpError("Registration document has an invalid shape.", 500);
    }

    await databases.updateDocument<RegistrationDocument>(
      databaseId,
      registrationsCollectionId,
      registrationId,
      {
        status: "approved",
        rejectionReason: "",
      },
    );
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function rejectRegistration(
  registrationId: string,
  reason?: string,
): Promise<void> {
  const databases = getAppwriteDatabases();
  const { databaseId, registrationsCollectionId } = getAppwriteCollections();

  try {
    const registration = await databases.getDocument<RegistrationDocument>(
      databaseId,
      registrationsCollectionId,
      registrationId,
    );

    if (registration.status !== "pending") {
      throw new HttpError("Only pending registrations can be rejected.", 409);
    }

    await databases.updateDocument<RegistrationDocument>(
      databaseId,
      registrationsCollectionId,
      registrationId,
      {
        status: "rejected",
        rejectionReason: reason ?? "Rejected by admin.",
      },
    );
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

function mapFreeAgentDocument(document: FreeAgentDocument): SoloPlayerPoolRecord {
  return {
    id: document.$id,
    name: document.name,
    riotId: document.riotId,
    discordId: document.discordId,
    preferredRole: document.preferredRole,
    eventId: document.eventId,
    status: document.status,
    email: document.email,
    currentRank: document.currentRank,
    peakRank: document.peakRank,
  };
}

function mapUnderfilledTeamDocument(document: TeamDocument): UnderfilledTeamRecord {
  const playerCount = Number.isFinite(document.playerCount) ? document.playerCount : 0;
  return {
    id: document.$id,
    teamName: document.teamName,
    captainDiscordId: document.captainDiscordId,
    eventId: document.eventId,
    playerCount,
    slotsRemaining: Math.max(0, 5 - playerCount),
  };
}

function mapTeamRosterPlayer(document: PlayerDocument): TeamRosterPlayerRecord {
  return {
    id: document.$id,
    name: document.name,
    riotId: document.riotId,
    discordId: document.discordId,
    role: document.role,
    eventId: document.eventId,
    teamId: document.teamId,
    registrationId: document.registrationId,
    createdAt: document.$createdAt ?? null,
    updatedAt: document.$updatedAt ?? null,
  };
}

async function listAllPlayersByEvent(eventId: string): Promise<PlayerDocument[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, playersCollectionId } = getAppwriteCollections();
  const documents: PlayerDocument[] = [];
  let cursorAfter: string | undefined;

  try {
    while (true) {
      const queries = [Query.equal("eventId", eventId), Query.orderAsc("$id"), Query.limit(100)];

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter));
      }

      const page = await databases.listDocuments<PlayerDocument>(
        databaseId,
        playersCollectionId,
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

function normalizeSelectedSoloPlayerIds(ids: string[]): string[] {
  const normalized = ids
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const deduped = Array.from(new Set(normalized));
  if (deduped.length !== normalized.length) {
    throw new HttpError("Duplicate solo player IDs are not allowed.", 400);
  }

  return deduped;
}

async function fetchAvailableSoloPlayersByIds(
  databases: Databases,
  databaseId: string,
  freeAgentsCollectionId: string,
  eventId: string,
  soloPlayerIds: string[],
): Promise<FreeAgentDocument[]> {
  if (soloPlayerIds.length === 0) {
    throw new HttpError("At least one solo player ID is required.", 400);
  }

  if (soloPlayerIds.length > 100) {
    throw new HttpError("A single request can include at most 100 solo players.", 400);
  }

  const documents = await databases.listDocuments<FreeAgentDocument>(
    databaseId,
    freeAgentsCollectionId,
    [
      Query.equal("eventId", eventId),
      Query.equal("status", "available"),
      Query.equal("$id", soloPlayerIds),
      Query.limit(soloPlayerIds.length),
    ],
  );

  const byId = new Map(documents.documents.map((document) => [document.$id, document]));
  const selected = soloPlayerIds.map((soloPlayerId) => byId.get(soloPlayerId));
  const missing = soloPlayerIds.filter((soloPlayerId, index) => !selected[index]);

  if (missing.length > 0) {
    throw new HttpError(
      `Some selected solo players are unavailable or not found: ${missing.join(", ")}`,
      404,
    );
  }

  return selected as FreeAgentDocument[];
}

async function assignSoloPlayerToTeam(
  databases: Databases,
  ids: {
    databaseId: string;
    playersCollectionId: string;
    freeAgentsCollectionId: string;
    teamId: string;
    eventId: string;
  },
  soloPlayer: FreeAgentDocument,
): Promise<void> {
  const playerDocument = await databases.createDocument(
    ids.databaseId,
    ids.playersCollectionId,
    ID.unique(),
    {
      name: soloPlayer.name,
      riotId: soloPlayer.riotId,
      discordId: soloPlayer.discordId,
      role: soloPlayer.preferredRole,
      eventId: ids.eventId,
      teamId: ids.teamId,
      registrationId: soloPlayer.registrationId ?? `solo_${soloPlayer.$id}`,
    },
  );

  try {
    await databases.updateDocument(
      ids.databaseId,
      ids.freeAgentsCollectionId,
      soloPlayer.$id,
      {
        status: "assigned",
        assignedTeamId: ids.teamId,
        assignedAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    try {
      await databases.deleteDocument(ids.databaseId, ids.playersCollectionId, playerDocument.$id);
    } catch (cleanupError) {
      const cleanupMessage =
        cleanupError instanceof Error && cleanupError.message.trim().length > 0
          ? cleanupError.message
          : "unknown cleanup error";
      throw new HttpError(
        `Failed to update solo player assignment and cleanup failed: ${cleanupMessage}`,
        500,
      );
    }

    throw normalizeServiceError(error);
  }
}

function buildRandomTeamOperationId(): string {
  return `solo_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSoloPlayersByEvent(
  eventId: string,
  options?: {
    status?: SoloPlayerStatus;
    limit?: number;
  },
): Promise<SoloPlayerPoolRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, freeAgentsCollectionId } = getAppwriteCollections();
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }

  const limit = options?.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError("Limit must be an integer between 1 and 200.", 400);
  }

  const status = options?.status ?? "available";

  try {
    const documents = await databases.listDocuments<FreeAgentDocument>(
      databaseId,
      freeAgentsCollectionId,
      [
        Query.equal("eventId", normalizedEventId),
        Query.equal("status", status),
        Query.orderAsc("$createdAt"),
        Query.limit(limit),
      ],
    );

    return documents.documents.map(mapFreeAgentDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function listUnderfilledTeamsByEvent(
  eventId: string,
  limit = 100,
): Promise<UnderfilledTeamRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, teamsCollectionId } = getAppwriteCollections();
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError("Limit must be an integer between 1 and 200.", 400);
  }

  try {
    const documents = await databases.listDocuments<TeamDocument>(
      databaseId,
      teamsCollectionId,
      [
        Query.equal("eventId", normalizedEventId),
        Query.lessThan("playerCount", 5),
        Query.orderAsc("playerCount"),
        Query.limit(limit),
      ],
    );

    return documents.documents.map(mapUnderfilledTeamDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function listApprovedTeamRostersByEvent(
  eventId: string,
  limit = 100,
): Promise<ApprovedTeamRosterRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, teamsCollectionId } = getAppwriteCollections();
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError("Limit must be an integer between 1 and 200.", 400);
  }

  try {
    const teamsPage = await databases.listDocuments<TeamDocument>(
      databaseId,
      teamsCollectionId,
      [
        Query.equal("eventId", normalizedEventId),
        Query.orderAsc("$createdAt"),
        Query.limit(limit),
      ],
    );
    const approvedTeams = teamsPage.documents.filter(
      (team) => team.status?.trim().toLowerCase() === "approved",
    );

    if (approvedTeams.length === 0) {
      return [];
    }

    const players = await listAllPlayersByEvent(normalizedEventId);
    const playersByTeamId = new Map<string, TeamRosterPlayerRecord[]>();
    for (const player of players) {
      const mappedPlayer = mapTeamRosterPlayer(player);
      const teamPlayers = playersByTeamId.get(player.teamId);
      if (teamPlayers) {
        teamPlayers.push(mappedPlayer);
      } else {
        playersByTeamId.set(player.teamId, [mappedPlayer]);
      }
    }

    const sortedApprovedTeams = approvedTeams.sort((first, second) => {
      if (first.teamName !== second.teamName) {
        return first.teamName.localeCompare(second.teamName);
      }
      return first.$id.localeCompare(second.$id);
    });

    return sortedApprovedTeams.map((team) => {
      const rosterPlayers = [...(playersByTeamId.get(team.$id) ?? [])].sort((first, second) => {
        const firstCreated = first.createdAt ?? "";
        const secondCreated = second.createdAt ?? "";
        if (firstCreated !== secondCreated) {
          return firstCreated.localeCompare(secondCreated);
        }

        return first.id.localeCompare(second.id);
      });

      return {
        id: team.$id,
        teamName: team.teamName,
        captainDiscordId: team.captainDiscordId,
        eventId: team.eventId,
        playerCount: Number.isFinite(team.playerCount) ? team.playerCount : rosterPlayers.length,
        status: team.status,
        registrationId: team.registrationId,
        email: team.email,
        teamLogoUrl: team.teamLogoUrl,
        teamTag: team.teamTag,
        createdAt: team.$createdAt ?? null,
        updatedAt: team.$updatedAt ?? null,
        players: rosterPlayers,
      };
    });
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function createRandomTeamsFromSoloPlayers(
  eventId: string,
  selectedSoloPlayerIds: string[],
  teamSize = 5,
): Promise<RandomTeamCreationSummary> {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }

  if (teamSize !== 5) {
    throw new HttpError("Only team size 5 is supported.", 400);
  }

  const normalizedIds = normalizeSelectedSoloPlayerIds(selectedSoloPlayerIds);
  if (normalizedIds.length < teamSize) {
    throw new HttpError("At least 5 selected solo players are required.", 400);
  }

  if (normalizedIds.length % teamSize !== 0) {
    throw new HttpError("Selected solo player count must be divisible by 5.", 400);
  }

  const databases = getAppwriteDatabases();
  const {
    databaseId,
    freeAgentsCollectionId,
    playersCollectionId,
    teamsCollectionId,
  } = getAppwriteCollections();
  const operationId = buildRandomTeamOperationId();

  try {
    const selectedSoloPlayers = await fetchAvailableSoloPlayersByIds(
      databases,
      databaseId,
      freeAgentsCollectionId,
      normalizedEventId,
      normalizedIds,
    );

    const createdTeamIds: string[] = [];
    const sharedRegistrationId = `generated_${operationId}`;

    for (let index = 0; index < selectedSoloPlayers.length; index += teamSize) {
      const chunk = selectedSoloPlayers.slice(index, index + teamSize);
      const createdTeam = await databases.createDocument(
        databaseId,
        teamsCollectionId,
        ID.unique(),
        stripUndefined({
          teamName: `Solo Squad ${createdTeamIds.length + 1}`,
          captainDiscordId: chunk[0].discordId,
          eventId: normalizedEventId,
          playerCount: 0,
          status: "approved",
          registrationId: sharedRegistrationId,
        }),
      );

      let assignedCount = 0;
      for (const soloPlayer of chunk) {
        await assignSoloPlayerToTeam(
          databases,
          {
            databaseId,
            playersCollectionId,
            freeAgentsCollectionId,
            teamId: createdTeam.$id,
            eventId: normalizedEventId,
          },
          {
            ...soloPlayer,
            registrationId: soloPlayer.registrationId ?? sharedRegistrationId,
          },
        );
        assignedCount += 1;
      }

      await databases.updateDocument<TeamDocument>(
        databaseId,
        teamsCollectionId,
        createdTeam.$id,
        {
          playerCount: assignedCount,
        },
      );

      createdTeamIds.push(createdTeam.$id);
    }

    return {
      operationId,
      eventId: normalizedEventId,
      teamSize,
      selectedCount: normalizedIds.length,
      createdTeamCount: createdTeamIds.length,
      createdTeamIds,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function assignSoloPlayersToExistingTeam(
  eventId: string,
  teamId: string,
  selectedSoloPlayerIds: string[],
): Promise<SoloPlayerAssignmentSummary> {
  const normalizedEventId = eventId.trim();
  const normalizedTeamId = teamId.trim();
  if (!normalizedEventId) {
    throw new HttpError("Event ID is required.", 400);
  }

  if (!normalizedTeamId) {
    throw new HttpError("Team ID is required.", 400);
  }

  const normalizedIds = normalizeSelectedSoloPlayerIds(selectedSoloPlayerIds);
  if (normalizedIds.length === 0) {
    throw new HttpError("At least one solo player ID is required.", 400);
  }

  const databases = getAppwriteDatabases();
  const {
    databaseId,
    freeAgentsCollectionId,
    playersCollectionId,
    teamsCollectionId,
  } = getAppwriteCollections();

  try {
    const team = await databases.getDocument<TeamDocument>(
      databaseId,
      teamsCollectionId,
      normalizedTeamId,
    );

    if (team.eventId !== normalizedEventId) {
      throw new HttpError("Selected team does not belong to the requested event.", 409);
    }

    const currentPlayerCount = Number.isFinite(team.playerCount) ? team.playerCount : 0;
    if (currentPlayerCount >= 5) {
      throw new HttpError("Selected team already has 5 or more players.", 409);
    }

    const selectedSoloPlayers = await fetchAvailableSoloPlayersByIds(
      databases,
      databaseId,
      freeAgentsCollectionId,
      normalizedEventId,
      normalizedIds,
    );

    if (currentPlayerCount + selectedSoloPlayers.length > 5) {
      throw new HttpError(
        `Selected team has ${currentPlayerCount} players and can accept at most ${5 - currentPlayerCount} more.`,
        409,
      );
    }

    for (const soloPlayer of selectedSoloPlayers) {
      await assignSoloPlayerToTeam(
        databases,
        {
          databaseId,
          playersCollectionId,
          freeAgentsCollectionId,
          teamId: normalizedTeamId,
          eventId: normalizedEventId,
        },
        soloPlayer,
      );
    }

    const resultingPlayerCount = currentPlayerCount + selectedSoloPlayers.length;
    await databases.updateDocument<TeamDocument>(
      databaseId,
      teamsCollectionId,
      normalizedTeamId,
      {
        playerCount: resultingPlayerCount,
      },
    );

    return {
      eventId: normalizedEventId,
      teamId: normalizedTeamId,
      assignedCount: selectedSoloPlayers.length,
      resultingPlayerCount,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export type TeamUpdateInput = {
  teamName?: string;
  captainDiscordId?: string;
  teamTag?: string;
  teamLogoUrl?: string;
};

export type TeamPlayerAddInput = {
  name: string;
  riotId: string;
  discordId: string;
  role: TeamPlayerInput["role"];
  registrationId?: string;
};

export type TeamPlayerUpdateInput = {
  name?: string;
  riotId?: string;
  discordId?: string;
  role?: TeamPlayerInput["role"];
};

export type TeamPlayerMoveDestination =
  | { type: "team"; teamId: string }
  | { type: "free_agent" };

export type FreeAgentUpdateInput = {
  name?: string;
  riotId?: string;
  discordId?: string;
  preferredRole?: TeamPlayerInput["role"];
  email?: string;
  currentRank?: SoloRegistrationInput["currentRank"];
  peakRank?: SoloRegistrationInput["peakRank"];
};

type TeamEditableRecord = {
  id: string;
  eventId: string;
  teamName: string;
  captainDiscordId: string;
  playerCount: number;
  teamTag?: string;
  teamLogoUrl?: string;
  registrationId?: string;
};

type TeamPlayerMutationSummary = {
  eventId: string;
  teamId: string;
  playerId: string;
  resultingPlayerCount: number;
};

type TeamPlayerMoveSummary = {
  eventId: string;
  playerId: string;
  fromTeamId: string;
  toTeamId?: string;
  toFreeAgentId?: string;
};

function normalizeRequiredId(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(`${fieldName} is required.`, 400);
  }

  return normalized;
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeUpdatePayload<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function mapTeamEditableRecord(team: TeamDocument): TeamEditableRecord {
  return {
    id: team.$id,
    eventId: team.eventId,
    teamName: team.teamName,
    captainDiscordId: team.captainDiscordId,
    playerCount: Number.isFinite(team.playerCount) ? team.playerCount : 0,
    teamTag: team.teamTag,
    teamLogoUrl: team.teamLogoUrl,
    registrationId: team.registrationId,
  };
}

async function getTeamByIdForEvent(
  databases: Databases,
  ids: {
    databaseId: string;
    teamsCollectionId: string;
  },
  eventId: string,
  teamId: string,
): Promise<TeamDocument> {
  const team = await databases.getDocument<TeamDocument>(
    ids.databaseId,
    ids.teamsCollectionId,
    teamId,
  );

  if (team.eventId !== eventId) {
    throw new HttpError("Selected team does not belong to the requested event.", 409);
  }

  return team;
}

async function getTeamPlayerByIdForEvent(
  databases: Databases,
  ids: {
    databaseId: string;
    playersCollectionId: string;
  },
  eventId: string,
  playerId: string,
): Promise<PlayerDocument> {
  const player = await databases.getDocument<PlayerDocument>(
    ids.databaseId,
    ids.playersCollectionId,
    playerId,
  );

  if (player.eventId !== eventId) {
    throw new HttpError("Selected player does not belong to the requested event.", 409);
  }

  return player;
}

async function getFreeAgentByIdForEvent(
  databases: Databases,
  ids: {
    databaseId: string;
    freeAgentsCollectionId: string;
  },
  eventId: string,
  freeAgentId: string,
): Promise<FreeAgentDocument> {
  const freeAgent = await databases.getDocument<FreeAgentDocument>(
    ids.databaseId,
    ids.freeAgentsCollectionId,
    freeAgentId,
  );

  if (freeAgent.eventId !== eventId) {
    throw new HttpError("Selected solo player does not belong to the requested event.", 409);
  }

  return freeAgent;
}

async function syncTeamPlayerCount(
  databases: Databases,
  ids: {
    databaseId: string;
    playersCollectionId: string;
    teamsCollectionId: string;
  },
  eventId: string,
  teamId: string,
): Promise<number> {
  const teamPlayers = await databases.listDocuments<PlayerDocument>(
    ids.databaseId,
    ids.playersCollectionId,
    [
      Query.equal("eventId", eventId),
      Query.equal("teamId", teamId),
      Query.limit(100),
    ],
  );

  const playerCount = teamPlayers.documents.length;
  await databases.updateDocument<TeamDocument>(ids.databaseId, ids.teamsCollectionId, teamId, {
    playerCount,
  });

  return playerCount;
}

async function resolveFreeAgentForPlayerReturn(
  databases: Databases,
  ids: {
    databaseId: string;
    freeAgentsCollectionId: string;
  },
  player: PlayerDocument,
): Promise<string> {
  const candidates = await databases.listDocuments<FreeAgentDocument>(
    ids.databaseId,
    ids.freeAgentsCollectionId,
    [
      Query.equal("eventId", player.eventId),
      Query.equal("status", "assigned"),
      Query.equal("riotId", player.riotId),
      Query.equal("discordId", player.discordId),
      Query.limit(10),
    ],
  );

  const existing = candidates.documents.find((candidate) => {
    if (!candidate.assignedTeamId) {
      return true;
    }

    return candidate.assignedTeamId === player.teamId;
  });

  if (existing) {
    await databases.updateDocument<FreeAgentDocument>(
      ids.databaseId,
      ids.freeAgentsCollectionId,
      existing.$id,
      {
        name: player.name,
        riotId: player.riotId,
        discordId: player.discordId,
        preferredRole: player.role,
        status: "available",
      },
    );
    return existing.$id;
  }

  const created = await databases.createDocument<FreeAgentDocument>(
    ids.databaseId,
    ids.freeAgentsCollectionId,
    ID.unique(),
    {
      name: player.name,
      riotId: player.riotId,
      discordId: player.discordId,
      preferredRole: player.role,
      eventId: player.eventId,
      status: "available",
      registrationId: player.registrationId,
    },
  );

  return created.$id;
}

export async function updateTeam(
  eventId: string,
  teamId: string,
  updates: TeamUpdateInput,
): Promise<TeamEditableRecord> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedTeamId = normalizeRequiredId(teamId, "Team ID");
  const updatePayload = normalizeUpdatePayload(updates);

  if (Object.keys(updatePayload).length === 0) {
    throw new HttpError("At least one team field must be provided for update.", 400);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, teamsCollectionId } = getAppwriteCollections();

  try {
    await getTeamByIdForEvent(
      databases,
      { databaseId, teamsCollectionId },
      normalizedEventId,
      normalizedTeamId,
    );

    const updatedTeam = await databases.updateDocument<TeamDocument>(
      databaseId,
      teamsCollectionId,
      normalizedTeamId,
      updatePayload,
    );

    return mapTeamEditableRecord(updatedTeam);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function addPlayerToTeam(
  eventId: string,
  teamId: string,
  playerInput: TeamPlayerAddInput,
): Promise<TeamPlayerMutationSummary> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedTeamId = normalizeRequiredId(teamId, "Team ID");
  const normalizedRegistrationId =
    normalizeOptionalId(playerInput.registrationId) ??
    `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const databases = getAppwriteDatabases();
  const { databaseId, teamsCollectionId, playersCollectionId } = getAppwriteCollections();

  try {
    const team = await getTeamByIdForEvent(
      databases,
      { databaseId, teamsCollectionId },
      normalizedEventId,
      normalizedTeamId,
    );

    const currentPlayerCount = Number.isFinite(team.playerCount) ? team.playerCount : 0;
    if (currentPlayerCount >= 5) {
      throw new HttpError("Selected team already has 5 or more players.", 409);
    }

    const createdPlayer = await databases.createDocument<PlayerDocument>(
      databaseId,
      playersCollectionId,
      ID.unique(),
      {
        name: playerInput.name,
        riotId: playerInput.riotId,
        discordId: playerInput.discordId,
        role: playerInput.role,
        eventId: normalizedEventId,
        teamId: normalizedTeamId,
        registrationId: normalizedRegistrationId,
      },
    );

    try {
      const resultingPlayerCount = await syncTeamPlayerCount(
        databases,
        { databaseId, playersCollectionId, teamsCollectionId },
        normalizedEventId,
        normalizedTeamId,
      );

      return {
        eventId: normalizedEventId,
        teamId: normalizedTeamId,
        playerId: createdPlayer.$id,
        resultingPlayerCount,
      };
    } catch (error) {
      try {
        await databases.deleteDocument(databaseId, playersCollectionId, createdPlayer.$id);
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error && cleanupError.message.trim().length > 0
            ? cleanupError.message
            : "unknown cleanup error";
        throw new HttpError(
          `Failed to update team player count and cleanup failed: ${cleanupMessage}`,
          500,
        );
      }

      throw error;
    }
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function updateTeamPlayer(
  eventId: string,
  teamId: string,
  playerId: string,
  updates: TeamPlayerUpdateInput,
): Promise<TeamRosterPlayerRecord> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedTeamId = normalizeRequiredId(teamId, "Team ID");
  const normalizedPlayerId = normalizeRequiredId(playerId, "Player ID");
  const updatePayload = normalizeUpdatePayload(updates);

  if (Object.keys(updatePayload).length === 0) {
    throw new HttpError("At least one player field must be provided for update.", 400);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, playersCollectionId } = getAppwriteCollections();

  try {
    const player = await getTeamPlayerByIdForEvent(
      databases,
      { databaseId, playersCollectionId },
      normalizedEventId,
      normalizedPlayerId,
    );

    if (player.teamId !== normalizedTeamId) {
      throw new HttpError("Selected player does not belong to the requested team.", 409);
    }

    const updatedPlayer = await databases.updateDocument<PlayerDocument>(
      databaseId,
      playersCollectionId,
      normalizedPlayerId,
      updatePayload,
    );

    return mapTeamRosterPlayer(updatedPlayer);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function moveTeamPlayer(
  eventId: string,
  playerId: string,
  destination: TeamPlayerMoveDestination,
): Promise<TeamPlayerMoveSummary> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedPlayerId = normalizeRequiredId(playerId, "Player ID");

  const databases = getAppwriteDatabases();
  const {
    databaseId,
    playersCollectionId,
    teamsCollectionId,
    freeAgentsCollectionId,
  } = getAppwriteCollections();

  try {
    const player = await getTeamPlayerByIdForEvent(
      databases,
      { databaseId, playersCollectionId },
      normalizedEventId,
      normalizedPlayerId,
    );
    const fromTeamId = player.teamId;
    await getTeamByIdForEvent(
      databases,
      { databaseId, teamsCollectionId },
      normalizedEventId,
      fromTeamId,
    );

    if (destination.type === "team") {
      const normalizedDestinationTeamId = normalizeRequiredId(
        destination.teamId,
        "Destination team ID",
      );

      if (normalizedDestinationTeamId === fromTeamId) {
        throw new HttpError("Player is already in the selected team.", 409);
      }

      const destinationTeam = await getTeamByIdForEvent(
        databases,
        { databaseId, teamsCollectionId },
        normalizedEventId,
        normalizedDestinationTeamId,
      );
      const destinationCount = Number.isFinite(destinationTeam.playerCount)
        ? destinationTeam.playerCount
        : 0;
      if (destinationCount >= 5) {
        throw new HttpError("Destination team already has 5 or more players.", 409);
      }

      await databases.updateDocument<PlayerDocument>(
        databaseId,
        playersCollectionId,
        normalizedPlayerId,
        { teamId: normalizedDestinationTeamId },
      );

      await syncTeamPlayerCount(
        databases,
        { databaseId, playersCollectionId, teamsCollectionId },
        normalizedEventId,
        fromTeamId,
      );
      await syncTeamPlayerCount(
        databases,
        { databaseId, playersCollectionId, teamsCollectionId },
        normalizedEventId,
        normalizedDestinationTeamId,
      );

      return {
        eventId: normalizedEventId,
        playerId: normalizedPlayerId,
        fromTeamId,
        toTeamId: normalizedDestinationTeamId,
      };
    }

    const freeAgentId = await resolveFreeAgentForPlayerReturn(
      databases,
      { databaseId, freeAgentsCollectionId },
      player,
    );
    await databases.deleteDocument(databaseId, playersCollectionId, normalizedPlayerId);
    await syncTeamPlayerCount(
      databases,
      { databaseId, playersCollectionId, teamsCollectionId },
      normalizedEventId,
      fromTeamId,
    );

    return {
      eventId: normalizedEventId,
      playerId: normalizedPlayerId,
      fromTeamId,
      toFreeAgentId: freeAgentId,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function removeTeamPlayer(
  eventId: string,
  teamId: string,
  playerId: string,
): Promise<TeamPlayerMutationSummary> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedTeamId = normalizeRequiredId(teamId, "Team ID");
  const normalizedPlayerId = normalizeRequiredId(playerId, "Player ID");

  const databases = getAppwriteDatabases();
  const { databaseId, playersCollectionId, teamsCollectionId } = getAppwriteCollections();

  try {
    const player = await getTeamPlayerByIdForEvent(
      databases,
      { databaseId, playersCollectionId },
      normalizedEventId,
      normalizedPlayerId,
    );
    if (player.teamId !== normalizedTeamId) {
      throw new HttpError("Selected player does not belong to the requested team.", 409);
    }

    await databases.deleteDocument(databaseId, playersCollectionId, normalizedPlayerId);
    const resultingPlayerCount = await syncTeamPlayerCount(
      databases,
      { databaseId, playersCollectionId, teamsCollectionId },
      normalizedEventId,
      normalizedTeamId,
    );

    return {
      eventId: normalizedEventId,
      teamId: normalizedTeamId,
      playerId: normalizedPlayerId,
      resultingPlayerCount,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function updateFreeAgent(
  eventId: string,
  freeAgentId: string,
  updates: FreeAgentUpdateInput,
): Promise<SoloPlayerPoolRecord> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedFreeAgentId = normalizeRequiredId(freeAgentId, "Solo player ID");
  const updatePayload = normalizeUpdatePayload(updates);

  if (Object.keys(updatePayload).length === 0) {
    throw new HttpError("At least one solo player field must be provided for update.", 400);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, freeAgentsCollectionId } = getAppwriteCollections();

  try {
    const freeAgent = await getFreeAgentByIdForEvent(
      databases,
      { databaseId, freeAgentsCollectionId },
      normalizedEventId,
      normalizedFreeAgentId,
    );

    if (freeAgent.status !== "available") {
      throw new HttpError("Only available solo players can be edited.", 409);
    }

    const updatedFreeAgent = await databases.updateDocument<FreeAgentDocument>(
      databaseId,
      freeAgentsCollectionId,
      normalizedFreeAgentId,
      updatePayload,
    );

    return mapFreeAgentDocument(updatedFreeAgent);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function removeFreeAgent(
  eventId: string,
  freeAgentId: string,
): Promise<{ eventId: string; freeAgentId: string }> {
  const normalizedEventId = normalizeRequiredId(eventId, "Event ID");
  const normalizedFreeAgentId = normalizeRequiredId(freeAgentId, "Solo player ID");

  const databases = getAppwriteDatabases();
  const { databaseId, freeAgentsCollectionId } = getAppwriteCollections();

  try {
    const freeAgent = await getFreeAgentByIdForEvent(
      databases,
      { databaseId, freeAgentsCollectionId },
      normalizedEventId,
      normalizedFreeAgentId,
    );

    if (freeAgent.status !== "available") {
      throw new HttpError("Only available solo players can be removed.", 409);
    }

    await databases.deleteDocument(
      databaseId,
      freeAgentsCollectionId,
      normalizedFreeAgentId,
    );

    return {
      eventId: normalizedEventId,
      freeAgentId: normalizedFreeAgentId,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}
