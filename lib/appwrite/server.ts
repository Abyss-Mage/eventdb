import "server-only";

import { Client, Databases } from "node-appwrite";

import { getAppwriteServerEnv } from "@/lib/appwrite/env";

let cachedClient: Client | null = null;

export function getAppwriteServerClient(): Client {
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
  return new Databases(getAppwriteServerClient());
}

export function getAppwriteCollections() {
  const env = getAppwriteServerEnv();

  return {
    databaseId: env.APPWRITE_DATABASE_ID,
    registrationsCollectionId: env.APPWRITE_REGISTRATIONS_COLLECTION_ID,
    teamsCollectionId: env.APPWRITE_TEAMS_COLLECTION_ID,
    playersCollectionId: env.APPWRITE_PLAYERS_COLLECTION_ID,
    freeAgentsCollectionId: env.APPWRITE_FREE_AGENTS_COLLECTION_ID,
    eventsCollectionId: env.APPWRITE_EVENTS_COLLECTION_ID,
    matchesCollectionId: env.APPWRITE_MATCHES_COLLECTION_ID,
    teamStatsCollectionId: env.APPWRITE_TEAM_STATS_COLLECTION_ID,
    playerStatsCollectionId: env.APPWRITE_PLAYER_STATS_COLLECTION_ID,
    mvpCollectionId: env.APPWRITE_MVP_COLLECTION_ID,
    mapsCollectionId: env.APPWRITE_MAPS_COLLECTION_ID,
    adminAuditLogsCollectionId: env.APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID,
  };
}
