type AppwriteServerEnv = {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  APPWRITE_ADMIN_TEAM_IDS: string[];
  APPWRITE_DATABASE_ID: string;
  APPWRITE_USERS_COLLECTION_ID: string;
  APPWRITE_ORGANIZERS_COLLECTION_ID: string;
  APPWRITE_REGISTRATIONS_COLLECTION_ID: string;
  APPWRITE_TEAMS_COLLECTION_ID: string;
  APPWRITE_PLAYERS_COLLECTION_ID: string;
  APPWRITE_FREE_AGENTS_COLLECTION_ID: string;
  APPWRITE_EVENTS_COLLECTION_ID: string;
  APPWRITE_BRACKETS_COLLECTION_ID: string;
  APPWRITE_MATCHES_COLLECTION_ID: string;
  APPWRITE_TEAM_STATS_COLLECTION_ID: string;
  APPWRITE_PLAYER_STATS_COLLECTION_ID: string;
  APPWRITE_MVP_COLLECTION_ID: string;
  APPWRITE_TRANSACTIONS_COLLECTION_ID: string;
  APPWRITE_PAYOUTS_COLLECTION_ID: string;
  APPWRITE_MAPS_COLLECTION_ID: string;
  APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID: string;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function envWithDefault(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function envAsList(keys: string[]): string[] {
  const values = keys
    .flatMap((key) => (process.env[key] ?? "").split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(values));
}

export function getAppwriteServerEnv(): AppwriteServerEnv {
  return {
    APPWRITE_ENDPOINT: requireEnv("APPWRITE_ENDPOINT"),
    APPWRITE_PROJECT_ID: requireEnv("APPWRITE_PROJECT_ID"),
    APPWRITE_API_KEY: requireEnv("APPWRITE_API_KEY"),
    APPWRITE_ADMIN_TEAM_IDS: envAsList([
      "APPWRITE_ADMIN_TEAM_ID",
      "APPWRITE_ADMIN_TEAM_IDS",
    ]),
    APPWRITE_DATABASE_ID: requireEnv("APPWRITE_DATABASE_ID"),
    APPWRITE_USERS_COLLECTION_ID: envWithDefault(
      "APPWRITE_USERS_COLLECTION_ID",
      "users",
    ),
    APPWRITE_ORGANIZERS_COLLECTION_ID: envWithDefault(
      "APPWRITE_ORGANIZERS_COLLECTION_ID",
      "organizers",
    ),
    APPWRITE_REGISTRATIONS_COLLECTION_ID: requireEnv(
      "APPWRITE_REGISTRATIONS_COLLECTION_ID",
    ),
    APPWRITE_TEAMS_COLLECTION_ID: requireEnv("APPWRITE_TEAMS_COLLECTION_ID"),
    APPWRITE_PLAYERS_COLLECTION_ID: requireEnv("APPWRITE_PLAYERS_COLLECTION_ID"),
    APPWRITE_FREE_AGENTS_COLLECTION_ID: requireEnv(
      "APPWRITE_FREE_AGENTS_COLLECTION_ID",
    ),
    APPWRITE_EVENTS_COLLECTION_ID: envWithDefault(
      "APPWRITE_EVENTS_COLLECTION_ID",
      "events",
    ),
    APPWRITE_BRACKETS_COLLECTION_ID: envWithDefault(
      "APPWRITE_BRACKETS_COLLECTION_ID",
      "brackets",
    ),
    APPWRITE_MATCHES_COLLECTION_ID: envWithDefault(
      "APPWRITE_MATCHES_COLLECTION_ID",
      "matches",
    ),
    APPWRITE_TEAM_STATS_COLLECTION_ID: envWithDefault(
      "APPWRITE_TEAM_STATS_COLLECTION_ID",
      "team_stats",
    ),
    APPWRITE_PLAYER_STATS_COLLECTION_ID: envWithDefault(
      "APPWRITE_PLAYER_STATS_COLLECTION_ID",
      "player_stats",
    ),
    APPWRITE_MVP_COLLECTION_ID: envWithDefault("APPWRITE_MVP_COLLECTION_ID", "mvp"),
    APPWRITE_TRANSACTIONS_COLLECTION_ID: envWithDefault(
      "APPWRITE_TRANSACTIONS_COLLECTION_ID",
      "transactions",
    ),
    APPWRITE_PAYOUTS_COLLECTION_ID: envWithDefault(
      "APPWRITE_PAYOUTS_COLLECTION_ID",
      "payouts",
    ),
    APPWRITE_MAPS_COLLECTION_ID: envWithDefault("APPWRITE_MAPS_COLLECTION_ID", "maps"),
    APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID: envWithDefault(
      "APPWRITE_ADMIN_AUDIT_LOGS_COLLECTION_ID",
      "admin_audit_logs",
    ),
  };
}
