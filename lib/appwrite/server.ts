import "server-only";

import { Client, Databases } from "node-appwrite";

import { getAppwriteServerEnv } from "@/lib/appwrite/env";

let cachedClient: Client | null = null;

function getAppwriteClient(): Client {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getAppwriteServerEnv();
  cachedClient = new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY);

  return cachedClient;
}

export function getAppwriteDatabases(): Databases {
  return new Databases(getAppwriteClient());
}

export function getAppwriteCollections() {
  const env = getAppwriteServerEnv();

  return {
    databaseId: env.APPWRITE_DATABASE_ID,
    registrationsCollectionId: env.APPWRITE_REGISTRATIONS_COLLECTION_ID,
    teamsCollectionId: env.APPWRITE_TEAMS_COLLECTION_ID,
    playersCollectionId: env.APPWRITE_PLAYERS_COLLECTION_ID,
    freeAgentsCollectionId: env.APPWRITE_FREE_AGENTS_COLLECTION_ID,
  };
}
