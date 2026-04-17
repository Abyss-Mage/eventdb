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

  console.log("Appwrite schema deployment complete.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Schema deployment failed: ${message}`);
  process.exitCode = 1;
});
