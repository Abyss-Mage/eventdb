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
  RegistrationRecord,
  RegistrationStatus,
  SoloRegistrationInput,
  TeamPlayerInput,
  TeamRegistrationInput,
} from "@/lib/domain/types";

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

export async function createTeamRegistration(
  payload: TeamRegistrationInput,
): Promise<string> {
  const databases = getAppwriteDatabases();
  const { databaseId, registrationsCollectionId } = getAppwriteCollections();

  try {
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
