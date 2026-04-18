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
  const usersCollectionId = envWithDefault("APPWRITE_USERS_COLLECTION_ID", "users");
  const organizersCollectionId = envWithDefault(
    "APPWRITE_ORGANIZERS_COLLECTION_ID",
    "organizers",
  );
  const registrationsCollectionId = requireEnv("APPWRITE_REGISTRATIONS_COLLECTION_ID");
  const teamsCollectionId = requireEnv("APPWRITE_TEAMS_COLLECTION_ID");
  const playersCollectionId = requireEnv("APPWRITE_PLAYERS_COLLECTION_ID");
  const freeAgentsCollectionId = requireEnv("APPWRITE_FREE_AGENTS_COLLECTION_ID");
  const eventsCollectionId = envWithDefault("APPWRITE_EVENTS_COLLECTION_ID", "events");
  const bracketsCollectionId = envWithDefault(
    "APPWRITE_BRACKETS_COLLECTION_ID",
    "brackets",
  );
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
  const transactionsCollectionId = envWithDefault(
    "APPWRITE_TRANSACTIONS_COLLECTION_ID",
    "transactions",
  );
  const payoutsCollectionId = envWithDefault("APPWRITE_PAYOUTS_COLLECTION_ID", "payouts");
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

  await ensureCollection(databases, databaseId, usersCollectionId, "users");
  await ensureCollection(databases, databaseId, organizersCollectionId, "organizers");
  await ensureCollection(databases, databaseId, registrationsCollectionId, "registrations");
  await ensureCollection(databases, databaseId, teamsCollectionId, "teams");
  await ensureCollection(databases, databaseId, playersCollectionId, "players");
  await ensureCollection(databases, databaseId, freeAgentsCollectionId, "free_agents");
  await ensureCollection(databases, databaseId, eventsCollectionId, "events");
  await ensureCollection(databases, databaseId, bracketsCollectionId, "brackets");
  await ensureCollection(databases, databaseId, matchesCollectionId, "matches");
  await ensureCollection(databases, databaseId, teamStatsCollectionId, "team_stats");
  await ensureCollection(databases, databaseId, playerStatsCollectionId, "player_stats");
  await ensureCollection(databases, databaseId, mvpCollectionId, "mvp");
  await ensureCollection(databases, databaseId, transactionsCollectionId, "transactions");
  await ensureCollection(databases, databaseId, payoutsCollectionId, "payouts");
  await ensureCollection(databases, databaseId, mapsCollectionId, "maps");
  await ensureCollection(
    databases,
    databaseId,
    adminAuditLogsCollectionId,
    "admin_audit_logs",
  );

  await ensureAttribute(databases, databaseId, usersCollectionId, "appwriteUserId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "appwriteUserId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "displayName", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "displayName",
      size: 120,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "email", () =>
    databases.createEmailAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "email",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "phone", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "phone",
      size: 24,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "rolesJson", () =>
    databases.createLongtextAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "rolesJson",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "status",
      elements: ["active", "suspended", "deleted"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "defaultRegion", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "defaultRegion",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, usersCollectionId, "kycStatus", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: usersCollectionId,
      key: "kycStatus",
      elements: ["not_required", "pending", "verified", "rejected"],
      required: true,
    }),
  );

  await ensureAttribute(databases, databaseId, organizersCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "tenantId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "ownerUserId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "ownerUserId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "name", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "name",
      size: 120,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "slug", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "slug",
      size: 80,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "supportEmail", () =>
    databases.createEmailAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "supportEmail",
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    organizersCollectionId,
    "verificationStatus",
    () =>
      databases.createEnumAttribute({
        databaseId,
        collectionId: organizersCollectionId,
        key: "verificationStatus",
        elements: ["pending", "under_review", "approved", "rejected"],
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    organizersCollectionId,
    "verificationBadge",
    () =>
      databases.createBooleanAttribute({
        databaseId,
        collectionId: organizersCollectionId,
        key: "verificationBadge",
        required: true,
        default: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    organizersCollectionId,
    "commissionRateBps",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: organizersCollectionId,
        key: "commissionRateBps",
        required: true,
        min: 0,
      }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "payoutHoldDays", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "payoutHoldDays",
      required: true,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, organizersCollectionId, "isActive", () =>
    databases.createBooleanAttribute({
      databaseId,
      collectionId: organizersCollectionId,
      key: "isActive",
      required: true,
      default: true,
    }),
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
  await ensureAttribute(databases, databaseId, registrationsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: registrationsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    registrationsCollectionId,
    "organizerId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: registrationsCollectionId,
        key: "organizerId",
        size: 64,
        required: false,
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
  await ensureAttribute(databases, databaseId, teamsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, teamsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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
  await ensureAttribute(databases, databaseId, teamsCollectionId, "inviteCode", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamsCollectionId,
      key: "inviteCode",
      size: 24,
      required: false,
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
  await ensureAttribute(databases, databaseId, playersCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, playersCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playersCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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
  await ensureAttribute(databases, databaseId, freeAgentsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: freeAgentsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "organizerId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: freeAgentsCollectionId,
        key: "organizerId",
        size: 64,
        required: false,
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
  await ensureAttribute(databases, databaseId, eventsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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
  await ensureAttribute(databases, databaseId, eventsCollectionId, "format", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "format",
      elements: ["single_elimination", "double_elimination", "league"],
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "game", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "game",
      size: 40,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "region", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "region",
      size: 40,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "visibility", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "visibility",
      elements: ["public", "unlisted", "private"],
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "entryFeeMinor", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "entryFeeMinor",
      required: false,
      min: 0,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "currency", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "currency",
      size: 3,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "registrationMode", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "registrationMode",
      elements: ["manual_approval", "auto_approval"],
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    eventsCollectionId,
    "prizePoolConfigJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: eventsCollectionId,
        key: "prizePoolConfigJson",
        required: false,
      }),
  );
  await ensureAttribute(databases, databaseId, eventsCollectionId, "createdByUserId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: eventsCollectionId,
      key: "createdByUserId",
      size: 64,
      required: false,
    }),
  );

  await ensureAttribute(databases, databaseId, bracketsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "tenantId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "organizerId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "eventId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "format", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "format",
      elements: ["single_elimination", "double_elimination", "league"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "version", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "version",
      required: true,
      min: 1,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "state", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "state",
      elements: ["draft", "published", "locked", "completed"],
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "structureJson", () =>
    databases.createLongtextAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "structureJson",
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    bracketsCollectionId,
    "generatedByUserId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: bracketsCollectionId,
        key: "generatedByUserId",
        size: 64,
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, bracketsCollectionId, "publishedAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: bracketsCollectionId,
      key: "publishedAt",
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
  await ensureAttribute(databases, databaseId, matchesCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "bracketId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "bracketId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "roundNumber", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "roundNumber",
      required: false,
      min: 1,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "matchNumber", () =>
    databases.createIntegerAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "matchNumber",
      required: false,
      min: 1,
    }),
  );
  await ensureAttribute(databases, databaseId, matchesCollectionId, "stage", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: matchesCollectionId,
      key: "stage",
      size: 40,
      required: false,
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
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, teamStatsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: teamStatsCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, playerStatsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: playerStatsCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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
  await ensureAttribute(databases, databaseId, mvpCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "tenantId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, mvpCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: mvpCollectionId,
      key: "organizerId",
      size: 64,
      required: false,
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

  await ensureAttribute(databases, databaseId, transactionsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "tenantId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "organizerId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "organizerId",
        size: 64,
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, transactionsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "eventId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "registrationId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "registrationId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "payerUserId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "payerUserId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(databases, databaseId, transactionsCollectionId, "payeeType", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "payeeType",
      elements: ["escrow", "organizer", "platform", "user_refund"],
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "transactionType",
    () =>
      databases.createEnumAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "transactionType",
        elements: [
          "entry_fee_charge",
          "escrow_credit",
          "escrow_debit",
          "commission_reserve",
          "refund",
          "adjustment",
        ],
        required: true,
      }),
  );
  await ensureAttribute(databases, databaseId, transactionsCollectionId, "gateway", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "gateway",
      elements: ["razorpay", "internal"],
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "gatewayOrderId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "gatewayOrderId",
        size: 128,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "gatewayPaymentId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "gatewayPaymentId",
        size: 128,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "gatewaySignature",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "gatewaySignature",
        size: 256,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "amountMinor",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "amountMinor",
        required: true,
        min: 0,
      }),
  );
  await ensureAttribute(databases, databaseId, transactionsCollectionId, "currency", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "currency",
      size: 3,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, transactionsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: transactionsCollectionId,
      key: "status",
      elements: ["initiated", "authorized", "captured", "failed", "refunded", "settled"],
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "riskFlagsJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "riskFlagsJson",
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    transactionsCollectionId,
    "metadataJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: transactionsCollectionId,
        key: "metadataJson",
        required: false,
      }),
  );

  await ensureAttribute(databases, databaseId, payoutsCollectionId, "tenantId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "tenantId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "organizerId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "organizerId",
      size: 64,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "eventId", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "eventId",
      size: 64,
      required: false,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "requestedAmountMinor",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "requestedAmountMinor",
        required: true,
        min: 0,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "approvedAmountMinor",
    () =>
      databases.createIntegerAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "approvedAmountMinor",
        required: false,
        min: 0,
      }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "currency", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "currency",
      size: 3,
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "status", () =>
    databases.createEnumAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "status",
      elements: [
        "requested",
        "under_review",
        "approved",
        "rejected",
        "processing",
        "paid",
        "failed",
      ],
      required: true,
    }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "requestedByUserId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "requestedByUserId",
        size: 64,
        required: true,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "reviewedByUserId",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "reviewedByUserId",
        size: 64,
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "sourceTransactionRefsJson",
    () =>
      databases.createLongtextAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "sourceTransactionRefsJson",
        required: false,
      }),
  );
  await ensureAttribute(
    databases,
    databaseId,
    payoutsCollectionId,
    "payoutReference",
    () =>
      databases.createStringAttribute({
        databaseId,
        collectionId: payoutsCollectionId,
        key: "payoutReference",
        size: 200,
        required: false,
      }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "failureReason", () =>
    databases.createStringAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "failureReason",
      size: 500,
      required: false,
    }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "requestedAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "requestedAt",
      required: true,
    }),
  );
  await ensureAttribute(databases, databaseId, payoutsCollectionId, "processedAt", () =>
    databases.createDatetimeAttribute({
      databaseId,
      collectionId: payoutsCollectionId,
      key: "processedAt",
      required: false,
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
    teamsCollectionId,
    "event_invite_code_idx",
    ["eventId", "inviteCode"],
    [OrderBy.Asc, OrderBy.Asc],
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
  await ensureIndex(
    databases,
    databaseId,
    usersCollectionId,
    "appwrite_user_id_idx",
    ["appwriteUserId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    usersCollectionId,
    "status_kyc_idx",
    ["status", "kycStatus"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    organizersCollectionId,
    "tenant_id_idx",
    ["tenantId"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    organizersCollectionId,
    "slug_idx",
    ["slug"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    organizersCollectionId,
    "owner_active_idx",
    ["ownerUserId", "isActive"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    organizersCollectionId,
    "verification_status_idx",
    ["verificationStatus"],
    [OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "tenant_slug_idx",
    ["tenantId", "slug"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "tenant_code_idx",
    ["tenantId", "code"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    eventsCollectionId,
    "discovery_idx",
    ["status", "game", "region", "entryFeeMinor"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    registrationsCollectionId,
    "tenant_event_status_idx",
    ["tenantId", "eventId", "status"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    teamsCollectionId,
    "tenant_event_idx",
    ["tenantId", "eventId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playersCollectionId,
    "tenant_team_idx",
    ["tenantId", "teamId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    freeAgentsCollectionId,
    "tenant_event_status_idx",
    ["tenantId", "eventId", "status"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    bracketsCollectionId,
    "event_version_idx",
    ["eventId", "version"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    bracketsCollectionId,
    "event_state_idx",
    ["eventId", "state"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    matchesCollectionId,
    "bracket_round_idx",
    ["bracketId", "roundNumber"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    matchesCollectionId,
    "tenant_event_status_idx",
    ["tenantId", "eventId", "status"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    teamStatsCollectionId,
    "tenant_event_idx",
    ["tenantId", "eventId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    playerStatsCollectionId,
    "tenant_event_player_idx",
    ["tenantId", "eventId", "playerId"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    mvpCollectionId,
    "tenant_event_rank_idx",
    ["tenantId", "eventId", "rank"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    transactionsCollectionId,
    "tenant_type_status_idx",
    ["tenantId", "transactionType", "status"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    transactionsCollectionId,
    "event_status_idx",
    ["eventId", "status"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    transactionsCollectionId,
    "gateway_payment_idx",
    ["gateway", "gatewayPaymentId"],
    [OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    payoutsCollectionId,
    "tenant_status_requested_idx",
    ["tenantId", "status", "requestedAt"],
    [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
  );
  await ensureIndex(
    databases,
    databaseId,
    payoutsCollectionId,
    "organizer_status_requested_idx",
    ["organizerId", "status", "requestedAt"],
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
