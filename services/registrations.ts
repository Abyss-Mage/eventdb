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
  EventRecord,
  RandomTeamCreationSummary,
  RegistrationRecord,
  RegistrationStatus,
  SoloPlayerAssignmentSummary,
  SoloRegistrationInput,
  SoloPlayerPoolRecord,
  SoloPlayerStatus,
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
  registrationId: string;
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
