import fs from "node:fs";
import path from "node:path";

import {
  AppwriteException,
  Client,
  Databases,
  DatabasesIndexType,
  OrderBy,
} from "node-appwrite";

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function envWithDefault(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function isNotFound(error) {
  return error instanceof AppwriteException && error.code === 404;
}

function isConflict(error) {
  return error instanceof AppwriteException && error.code === 409;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDatabase(databases, databaseId) {
  try {
    await databases.get(databaseId);
    console.log(`Database exists: ${databaseId}`);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await databases.create(databaseId, "League");
  console.log(`Created database: ${databaseId}`);
}

async function ensureCollection(databases, databaseId, collectionId, name) {
  try {
    await databases.getCollection(databaseId, collectionId);
    console.log(`Collection exists: ${collectionId}`);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await databases.createCollection({
    databaseId,
    collectionId,
    name,
    permissions: [],
    documentSecurity: false,
    enabled: true,
  });
  console.log(`Created collection: ${collectionId}`);
}

async function waitForAttribute(databases, databaseId, collectionId, key) {
  const deadline = Date.now() + 600_000;

  while (Date.now() < deadline) {
    const attribute = await databases.getAttribute(databaseId, collectionId, key);
    const status = attribute?.status ?? "available";

    if (status === "available") {
      return;
    }

    if (status === "failed") {
      throw new Error(
        `Attribute ${collectionId}.${key} failed to build in Appwrite.`,
      );
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for attribute ${collectionId}.${key}.`);
}

async function ensureAttribute(
  databases,
  databaseId,
  collectionId,
  key,
  createAttribute,
) {
  try {
    await databases.getAttribute(databaseId, collectionId, key);
    console.log(`Attribute exists: ${collectionId}.${key}`);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  try {
    await createAttribute();
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
  }

  await waitForAttribute(databases, databaseId, collectionId, key);
  console.log(`Attribute ensured: ${collectionId}.${key}`);
}

async function waitForIndex(databases, databaseId, collectionId, key) {
  const deadline = Date.now() + 600_000;

  while (Date.now() < deadline) {
    const index = await databases.getIndex(databaseId, collectionId, key);
    const status = index?.status ?? "available";

    if (status === "available") {
      return;
    }

    if (status === "failed") {
      throw new Error(`Index ${collectionId}.${key} failed to build in Appwrite.`);
    }

    await sleep(1500);
  }

  throw new Error(`Timed out waiting for index ${collectionId}.${key}.`);
}

async function ensureIndex(
  databases,
  databaseId,
  collectionId,
  key,
  attributes,
  orders = [],
) {
  try {
    await databases.getIndex(databaseId, collectionId, key);
    console.log(`Index exists: ${collectionId}.${key}`);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  try {
    await databases.createIndex({
      databaseId,
      collectionId,
      key,
      type: DatabasesIndexType.Key,
      attributes,
      orders,
    });
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
  }

  await waitForIndex(databases, databaseId, collectionId, key);
  console.log(`Index ensured: ${collectionId}.${key}`);
}

async function upsertDocument(
  databases,
  databaseId,
  collectionId,
  documentId,
  data,
) {
  try {
    await databases.getDocument(databaseId, collectionId, documentId);
    await databases.updateDocument(databaseId, collectionId, documentId, data);
    return;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await databases.createDocument(databaseId, collectionId, documentId, data);
}

async function main() {
  const cwd = process.cwd();
  loadEnvFromFile(path.join(cwd, ".env"));
  loadEnvFromFile(path.join(cwd, ".env.local"));

  const endpoint = requireEnv("APPWRITE_ENDPOINT");
  const projectId = requireEnv("APPWRITE_PROJECT_ID");
  const apiKey = requireEnv("APPWRITE_API_KEY");
  const databaseId = requireEnv("APPWRITE_DATABASE_ID");
  const registrationsCollectionId = requireEnv("APPWRITE_REGISTRATIONS_COLLECTION_ID");
  const teamsCollectionId = requireEnv("APPWRITE_TEAMS_COLLECTION_ID");
  const playersCollectionId = requireEnv("APPWRITE_PLAYERS_COLLECTION_ID");
  const freeAgentsCollectionId = requireEnv("APPWRITE_FREE_AGENTS_COLLECTION_ID");
  const eventsCollectionId = envWithDefault("APPWRITE_EVENTS_COLLECTION_ID", "events");
  const matchesCollectionId = envWithDefault("APPWRITE_MATCHES_COLLECTION_ID", "matches");
  const teamStatsCollectionId = envWithDefault(
    "APPWRITE_TEAM_STATS_COLLECTION_ID",
    "team_stats",
  );
  const playerStatsCollectionId = envWithDefault(
    "APPWRITE_PLAYER_STATS_COLLECTION_ID",
    "player_stats",
  );
  const mvpCollectionId = envWithDefault("APPWRITE_MVP_COLLECTION_ID", "mvp");
  const mapsCollectionId = envWithDefault("APPWRITE_MAPS_COLLECTION_ID", "maps");
  const adminAuditLogsCollectionId = envWithDefault(
    "APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID",
    "admin_audit_logs",
  );

  const roleValues = [
    "duelist",
    "controller",
    "initiator",
    "sentinel",
    "flex",
  ];
  const rankValues = [
    "iron",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "ascendant",
    "immortal",
    "radiant",
  ];
  const eventStatusValues = [
    "draft",
    "registration_open",
    "registration_closed",
    "in_progress",
    "completed",
    "archived",
  ];
  const matchStatusValues = [
    "scheduled",
    "in_progress",
    "completed",
    "forfeit",
    "cancelled",
  ];
  const valorantMaps = [
    { key: "abyss", name: "Abyss", sortOrder: 1 },
    { key: "ascent", name: "Ascent", sortOrder: 2 },
    { key: "bind", name: "Bind", sortOrder: 3 },
    { key: "breeze", name: "Breeze", sortOrder: 4 },
    { key: "corrode", name: "Corrode", sortOrder: 5 },
    { key: "fracture", name: "Fracture", sortOrder: 6 },
    { key: "haven", name: "Haven", sortOrder: 7 },
    { key: "icebox", name: "Icebox", sortOrder: 8 },
    { key: "lotus", name: "Lotus", sortOrder: 9 },
    { key: "pearl", name: "Pearl", sortOrder: 10 },
    { key: "split", name: "Split", sortOrder: 11 },
    { key: "sunset", name: "Sunset", sortOrder: 12 },
  ];

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  const databases = new Databases(client);

  console.log("Starting Appwrite schema deployment...");
  await ensureDatabase(databases, databaseId);

  await ensureCollection(databases, databaseId, registrationsCollectionId, "registrations");
  await ensureCollection(databases, databaseId, teamsCollectionId, "teams");
  await ensureCollection(databases, databaseId, playersCollectionId, "players");
  await ensureCollection(databases, databaseId, freeAgentsCollectionId, "free_agents");
  await ensureCollection(databases, databaseId, eventsCollectionId, "events");
  await ensureCollection(databases, databaseId, matchesCollectionId, "matches");
  await ensureCollection(databases, databaseId, teamStatsCollectionId, "team_stats");
  await ensureCollection(databases, databaseId, playerStatsCollectionId, "player_stats");
  await ensureCollection(databases, databaseId, mvpCollectionId, "mvp");
  await ensureCollection(databases, databaseId, mapsCollectionId, "maps");
  await ensureCollection(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "admin_audit_logs",
  );

  await ensureAttribute(databases, databaseId, registrationsCollectionId, "type", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "type",
      elements: ["team", "solo"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "status",
      elements: ["pending", "approved", "rejected"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "teamName", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "teamName",
      size: 100,
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    registrationsCollectionId,
    "captainDiscordId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: registrationsCollectionId,
        key: "captainDiscordId",
        size: 80,
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    registrationsCollectionId,
    "playersJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: registrationsCollectionId,
        key: "playersJson",
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "email", () =>
    databases.createEmailAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "email",
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    registrationsCollectionId,
    "teamLogoUrl",
    () =>
      databases.createUrlAttribute({
        databaseId,
        collectionId: registrationsCollectionId,
        key: "teamLogoUrl",
        required: false,
      }),
  );
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "teamTag", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "teamTag",
      size: 5,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    registrationsCollectionId,
    "rejectionReason",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: registrationsCollectionId,
        key: "rejectionReason",
        required: false,
      }),
  );

  await ensureAttribute(databases, databaseId, teamsCollectionId, "teamName", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "teamName",
      size: 100,
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    teamsCollectionId,
    "captainDiscordId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: teamsCollectionId,
        key: "captainDiscordId",
        size: 80,
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "playerCount", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "playerCount",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "status",
      elements: ["approved"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "registrationId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "registrationId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "email", () =>
    databases.createEmailAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "email",
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "teamLogoUrl", () =>
    databases.createUrlAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "teamLogoUrl",
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "teamTag", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "teamTag",
      size: 5,
      required: false,
    }),
  );

  await ensureAttribute(databases, databaseId, playersCollectionId, "name", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "name",
      size: 100,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "riotId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "riotId",
      size: 60,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "discordId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "discordId",
      size: 80,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "role", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "role",
      elements: roleValues,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "teamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "teamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "registrationId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "registrationId",
      size: 64,
      required: true,
    }),
  );

  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "name", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "name",
      size: 100,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "riotId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "riotId",
      size: 60,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "discordId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "discordId",
      size: 80,
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "preferredRole",
    () =>
      databases.createEnumAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "preferredRole",
        elements: roleValues,
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "status",
      elements: ["available", "assigned"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "email", () =>
    databases.createEmailAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "email",
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "currentRank",
    () =>
      databases.createEnumAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "currentRank",
        elements: rankValues,
        required: false,
      }),
  );
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "peakRank", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "peakRank",
      elements: rankValues,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "registrationId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "registrationId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "assignedTeamId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "assignedTeamId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "assignedAt",
    () =>
      databases.createDatetimeAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "assignedAt",
        required: false,
      }),
  );

  await ensureAttribute(databases, databaseId, eventsCollectionId, "name", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "name",
      size: 120,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "slug", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "slug",
      size: 80,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "code", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "code",
      size: 32,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "status",
      elements: eventStatusValues,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "startsAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "startsAt",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "endsAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "endsAt",
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    eventsCollectionId,
    "registrationOpensAt",
    () =>
      databases.createDatetimeAttribute({
        databaseId,
        collectionId: eventsCollectionId,
        key: "registrationOpensAt",
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    eventsCollectionId,
    "registrationClosesAt",
    () =>
      databases.createDatetimeAttribute({
        databaseId,
        collectionId: eventsCollectionId,
        key: "registrationClosesAt",
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    eventsCollectionId,
    "registrationLinkToken",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: eventsCollectionId,
        key: "registrationLinkToken",
        size: 120,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    eventsCollectionId,
    "registrationLinkMeta",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: eventsCollectionId,
        key: "registrationLinkMeta",
        required: false,
      }),
  );

  await ensureAttribute(databases, databaseId, matchesCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "homeTeamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "homeTeamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "awayTeamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "awayTeamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "mapRef", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "mapRef",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "playedAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "playedAt",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "status",
      elements: matchStatusValues,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "homeScore", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "homeScore",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "awayScore", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "awayScore",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    matchesCollectionId,
    "homeRoundDiff",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: matchesCollectionId,
        key: "homeRoundDiff",
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    matchesCollectionId,
    "awayRoundDiff",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: matchesCollectionId,
        key: "awayRoundDiff",
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, mapsCollectionId, "key", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mapsCollectionId,
      key: "key",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mapsCollectionId, "name", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mapsCollectionId,
      key: "name",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mapsCollectionId, "sortOrder", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mapsCollectionId,
      key: "sortOrder",
      required: true,
      min: 1,
    }),
  );
  await ensureAttribute(databases, databaseId, mapsCollectionId, "isActive", () =>
    databases.createBooleanAttribute({
      databaseId,
      collectionId: mapsCollectionId,
      key: "isActive",
      required: true,
      default: true,
    }),
  );

  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "teamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "teamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "teamName", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "teamName",
      size: 100,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "wins", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "wins",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "losses", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "losses",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    teamStatsCollectionId,
    "matchesPlayed",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: teamStatsCollectionId,
        key: "matchesPlayed",
        required: true,
        min: 0,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    teamStatsCollectionId,
    "roundDiff",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: teamStatsCollectionId,
        key: "roundDiff",
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "points", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "points",
      required: false,
      min: 0,
    }),
  );

  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "playerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "playerId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "teamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "teamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "matchId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "matchId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "mapRef", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "mapRef",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "kills", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "kills",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "deaths", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "deaths",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "assists", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "assists",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    playerStatsCollectionId,
    "matchesPlayed",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: playerStatsCollectionId,
        key: "matchesPlayed",
        required: true,
        min: 0,
      }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "mapsPlayed", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "mapsPlayed",
      required: true,
      min: 0,
    }),
  );

  await ensureAttribute(databases, databaseId, mvpCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "playerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "playerId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "teamId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "teamId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "kills", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "kills",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "deaths", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "deaths",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "assists", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "assists",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "matchesPlayed", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "matchesPlayed",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "roundDiff", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "roundDiff",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "points", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "points",
      required: false,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "score", () =>
    databases.createFloatAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "score",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "rank", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "rank",
      required: true,
      min: 1,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "generatedAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "generatedAt",
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "actorUserId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "actorUserId",
        size: 64,
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "actorEmail",
    () =>
      databases.createEmailAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "actorEmail",
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "action",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "action",
        size: 120,
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "resourceType",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "resourceType",
        size: 64,
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "resourceId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "resourceId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "eventId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "eventId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "detailsJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "detailsJson",
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "status",
    () =>
      databases.createEnumAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "status",
        elements: ["success", "failure"],
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "occurredAt",
    () =>
      databases.createDatetimeAttribute({
        databaseId,
        collectionId: adminAuditLogsCollectionId,
        key: "occurredAt",
        required: true,
      }),
  );

  await ensureIndex(
    databases,
    databaseId,
    registrationsCollectionId,
    "status_idx",
    ["status"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    teamsCollectionId,
    "registration_id_idx",
    ["registrationId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playersCollectionId,
    "team_id_idx",
    ["teamId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "status_idx",
    ["status"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "event_status_idx",
    ["eventId", "status"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "slug_idx",
    ["slug"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "code_idx",
    ["code"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "status_idx",
    ["status"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    matchesCollectionId,
    "event_id_idx",
    ["eventId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    matchesCollectionId,
    "event_played_at_idx",
    ["eventId", "playedAt"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    matchesCollectionId,
    "event_map_ref_idx",
    ["eventId", "mapRef"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    teamStatsCollectionId,
    "event_id_idx",
    ["eventId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    teamStatsCollectionId,
    "event_team_idx",
    ["eventId", "teamId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playerStatsCollectionId,
    "event_id_idx",
    ["eventId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playerStatsCollectionId,
    "event_player_idx",
    ["eventId", "playerId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playerStatsCollectionId,
    "match_id_idx",
    ["matchId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    mvpCollectionId,
    "event_rank_idx",
    ["eventId", "rank"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    mvpCollectionId,
    "event_player_idx",
    ["eventId", "playerId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    mapsCollectionId,
    "key_idx",
    ["key"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    mapsCollectionId,
    "sort_order_idx",
    ["sortOrder"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "occurred_at_idx",
    ["occurredAt"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "event_occurred_idx",
    ["eventId", "occurredAt"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "action_status_occurred_idx",
    ["action", "status", "occurredAt"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );

  for (const mapEntry of valorantMaps) {
    await upsertDocument(
      databases,
      databaseId,
      mapsCollectionId,
      mapEntry.key,
      {
        key: mapEntry.key,
        name: mapEntry.name,
        sortOrder: mapEntry.sortOrder,
        isActive: true,
      },
    );
    console.log(`Map seeded: ${mapEntry.key}`);
  }

  console.log("Appwrite schema deployment complete.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Schema deployment failed: ${message}`);
  process.exitCode = 1;
});
