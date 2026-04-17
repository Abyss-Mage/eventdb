type AppwriteServerEnv = {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  APPWRITE_DATABASE_ID: string;
  APPWRITE_REGISTRATIONS_COLLECTION_ID: string;
  APPWRITE_TEAMS_COLLECTION_ID: string;
  APPWRITE_PLAYERS_COLLECTION_ID: string;
  APPWRITE_FREE_AGENTS_COLLECTION_ID: string;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getAppwriteServerEnv(): AppwriteServerEnv {
  return {
    APPWRITE_ENDPOINT: requireEnv("APPWRITE_ENDPOINT"),
    APPWRITE_PROJECT_ID: requireEnv("APPWRITE_PROJECT_ID"),
    APPWRITE_API_KEY: requireEnv("APPWRITE_API_KEY"),
    APPWRITE_DATABASE_ID: requireEnv("APPWRITE_DATABASE_ID"),
    APPWRITE_REGISTRATIONS_COLLECTION_ID: requireEnv(
      "APPWRITE_REGISTRATIONS_COLLECTION_ID",
    ),
    APPWRITE_TEAMS_COLLECTION_ID: requireEnv("APPWRITE_TEAMS_COLLECTION_ID"),
    APPWRITE_PLAYERS_COLLECTION_ID: requireEnv("APPWRITE_PLAYERS_COLLECTION_ID"),
    APPWRITE_FREE_AGENTS_COLLECTION_ID: requireEnv(
      "APPWRITE_FREE_AGENTS_COLLECTION_ID",
    ),
  };
}
