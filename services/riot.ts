import "server-only";

import { setTimeout as delay } from "node:timers/promises";

import { HttpError } from "@/lib/errors/http-error";

const DEFAULT_PLATFORM_REGION = "ap";
const DEFAULT_ROUTING_REGION = "americas";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 500;

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type RiotApiTarget = "platform" | "routing";

type RiotRequestOptions = {
  target: RiotApiTarget;
  query?: Record<string, string | number | undefined>;
};

type RiotRuntimeConfig = {
  apiKey?: string;
  platformRegion: string;
  routingRegion: string;
  requestTimeoutMs: number;
  maxRetries: number;
  initialBackoffMs: number;
};

type RiotMatchTeam = {
  riotTeamId: string;
  roundsWon: number;
  roundsLost: number;
  won: boolean;
};

type RiotMatchPlayer = {
  puuid: string;
  riotTeamId: string;
  kills: number;
  deaths: number;
  assists: number;
  gameName?: string;
  tagLine?: string;
};

export type RiotApiConfigStatus = {
  configured: boolean;
  platformRegion: string;
  routingRegion: string;
};

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type RiotMatch = {
  riotMatchId: string;
  startedAt: string;
  isCompleted: boolean;
  teams: RiotMatchTeam[];
  players: RiotMatchPlayer[];
};

function normalizeRegion(
  value: string | undefined,
  fallback: string,
  fieldName: string,
): string {
  const normalized = value?.trim().toLowerCase() || fallback;
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new HttpError(`${fieldName} has an invalid format.`, 500);
  }

  return normalized;
}

function normalizePositiveInt(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(`${fieldName} must be a positive integer.`, 500);
  }

  return parsed;
}

function getRiotRuntimeConfig(): RiotRuntimeConfig {
  const apiKey = process.env.RIOT_API_KEY?.trim() || undefined;

  return {
    apiKey,
    platformRegion: normalizeRegion(
      process.env.RIOT_PLATFORM_REGION,
      DEFAULT_PLATFORM_REGION,
      "RIOT_PLATFORM_REGION",
    ),
    routingRegion: normalizeRegion(
      process.env.RIOT_ROUTING_REGION,
      DEFAULT_ROUTING_REGION,
      "RIOT_ROUTING_REGION",
    ),
    requestTimeoutMs: normalizePositiveInt(
      process.env.RIOT_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "RIOT_REQUEST_TIMEOUT_MS",
    ),
    maxRetries: normalizePositiveInt(
      process.env.RIOT_MAX_RETRIES,
      DEFAULT_MAX_RETRIES,
      "RIOT_MAX_RETRIES",
    ),
    initialBackoffMs: normalizePositiveInt(
      process.env.RIOT_INITIAL_BACKOFF_MS,
      DEFAULT_INITIAL_BACKOFF_MS,
      "RIOT_INITIAL_BACKOFF_MS",
    ),
  };
}

function ensureConfigured(config: RiotRuntimeConfig): string {
  if (!config.apiKey) {
    throw new HttpError(
      "Riot integration is not configured. Set RIOT_API_KEY.",
      503,
    );
  }

  return config.apiKey;
}

function getBaseUrl(config: RiotRuntimeConfig, target: RiotApiTarget): string {
  if (target === "platform") {
    return `https://${config.platformRegion}.api.riotgames.com`;
  }

  return `https://${config.routingRegion}.api.riotgames.com`;
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(`Riot response for ${context} has invalid shape.`, 502);
  }

  return value as Record<string, unknown>;
}

function asOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(`Riot response field ${fieldName} is missing.`, 502);
  }

  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asNonNegativeInteger(
  value: unknown,
  fieldName: string,
  fallback = 0,
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(`Riot response field ${fieldName} is invalid.`, 502);
  }

  const normalized = Math.trunc(value);
  if (normalized < 0) {
    throw new HttpError(
      `Riot response field ${fieldName} cannot be negative.`,
      502,
    );
  }

  return normalized;
}

function parseRetryAfterMs(response: Response): number | undefined {
  const retryAfterHeader = response.headers.get("Retry-After");
  if (!retryAfterHeader) {
    return undefined;
  }

  const retrySeconds = Number(retryAfterHeader);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return Math.ceil(retrySeconds * 1000);
  }

  return undefined;
}

function getBackoffDelayMs(
  config: RiotRuntimeConfig,
  attempt: number,
  response?: Response,
): number {
  const exponentialBackoff = config.initialBackoffMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * config.initialBackoffMs);
  const retryAfterMs = response ? parseRetryAfterMs(response) : undefined;
  const boundedBackoff = Math.min(exponentialBackoff + jitter, 15_000);

  if (retryAfterMs === undefined) {
    return boundedBackoff;
  }

  return Math.max(boundedBackoff, retryAfterMs);
}

async function readErrorPayload(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "string" && body.trim().length > 0) {
      return body;
    }

    const payload = asOptionalObject(body);
    if (!payload) {
      return undefined;
    }

    const statusMessage = asOptionalString(payload.status?.toString());
    const message = asOptionalString(payload.message);

    if (message && statusMessage) {
      return `${statusMessage}: ${message}`;
    }

    return message ?? statusMessage;
  } catch {
    return undefined;
  }
}

async function requestRiotJson(
  path: string,
  options: RiotRequestOptions,
): Promise<unknown> {
  const config = getRiotRuntimeConfig();
  const apiKey = ensureConfigured(config);
  const baseUrl = getBaseUrl(config, options.target);
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let lastErrorMessage: string | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "X-Riot-Token": apiKey },
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as unknown;
      }

      const isTransient = TRANSIENT_STATUS_CODES.has(response.status);
      const errorPayload = await readErrorPayload(response);
      const endpointDescription = `${url.pathname}${url.search}`;
      const message =
        errorPayload ??
        `Riot API request failed with status ${response.status} ${response.statusText}.`;
      lastErrorMessage = `${endpointDescription}: ${message}`;

      if (isTransient && attempt < config.maxRetries) {
        await delay(getBackoffDelayMs(config, attempt, response));
        continue;
      }

      throw new HttpError(
        `Riot API request failed for ${endpointDescription}: ${message}`,
        response.status,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const endpointDescription = `${url.pathname}${url.search}`;
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Network request failed.";
      lastErrorMessage = `${endpointDescription}: ${message}`;

      if (attempt < config.maxRetries) {
        await delay(getBackoffDelayMs(config, attempt));
        continue;
      }

      throw new HttpError(
        `Riot API request failed for ${endpointDescription}: ${message}`,
        502,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new HttpError(
    `Riot API request failed: ${lastErrorMessage ?? "unknown error"}.`,
    502,
  );
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 9_999_999_999 ? value : value * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  throw new HttpError("Riot match response is missing a valid start timestamp.", 502);
}

function normalizeTeam(value: unknown, index: number): RiotMatchTeam {
  const raw = asObject(value, `teams[${index}]`);
  const riotTeamId = asRequiredString(raw.teamId ?? raw.id, `teams[${index}].teamId`);
  const roundsWon = asNonNegativeInteger(
    raw.roundsWon ?? raw.score,
    `teams[${index}].roundsWon`,
  );
  const roundsLost = asNonNegativeInteger(
    raw.roundsLost,
    `teams[${index}].roundsLost`,
    0,
  );
  const won =
    typeof raw.won === "boolean" ? raw.won : roundsWon > roundsLost;

  return {
    riotTeamId,
    roundsWon,
    roundsLost,
    won,
  };
}

function normalizePlayer(value: unknown, index: number): RiotMatchPlayer {
  const raw = asObject(value, `players[${index}]`);
  const stats = asOptionalObject(raw.stats) ?? {};

  return {
    puuid: asRequiredString(raw.puuid, `players[${index}].puuid`),
    riotTeamId: asRequiredString(raw.teamId, `players[${index}].teamId`),
    kills: asNonNegativeInteger(stats.kills, `players[${index}].stats.kills`),
    deaths: asNonNegativeInteger(stats.deaths, `players[${index}].stats.deaths`),
    assists: asNonNegativeInteger(stats.assists, `players[${index}].stats.assists`),
    gameName: asOptionalString(raw.gameName),
    tagLine: asOptionalString(raw.tagLine),
  };
}

function extractMatchIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }

  const root = asObject(payload, "matchlist");
  const candidates = [root.history, root.matches, root.matchIds];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const matchIds: string[] = [];
    for (const entry of candidate) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        matchIds.push(entry.trim());
        continue;
      }

      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const directMatchId = asOptionalString(record.matchId);
      if (directMatchId) {
        matchIds.push(directMatchId);
        continue;
      }

      const matchInfo = asOptionalObject(record.matchInfo);
      const nestedMatchId = asOptionalString(matchInfo?.matchId);
      if (nestedMatchId) {
        matchIds.push(nestedMatchId);
      }
    }

    if (matchIds.length > 0) {
      return matchIds;
    }
  }

  throw new HttpError(
    "Riot matchlist response is not supported yet. Verify routing region and endpoint availability.",
    502,
  );
}

export function getRiotConfigStatus(): RiotApiConfigStatus {
  const config = getRiotRuntimeConfig();
  return {
    configured: Boolean(config.apiKey),
    platformRegion: config.platformRegion,
    routingRegion: config.routingRegion,
  };
}

export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const normalized = riotId.trim();
  const separatorAt = normalized.lastIndexOf("#");

  if (separatorAt < 1 || separatorAt === normalized.length - 1) {
    throw new HttpError(`Invalid Riot ID format: ${riotId}`, 400);
  }

  const gameName = normalized.slice(0, separatorAt).trim();
  const tagLine = normalized.slice(separatorAt + 1).trim();

  if (!gameName || !tagLine) {
    throw new HttpError(`Invalid Riot ID format: ${riotId}`, 400);
  }

  return { gameName, tagLine };
}

export async function resolveRiotAccountByRiotId(riotId: string): Promise<RiotAccount> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const payload = await requestRiotJson(
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { target: "routing" },
  );
  const root = asObject(payload, "account lookup");

  return {
    puuid: asRequiredString(root.puuid, "puuid"),
    gameName: asRequiredString(root.gameName, "gameName"),
    tagLine: asRequiredString(root.tagLine, "tagLine"),
  };
}

export async function listRiotMatchIdsByPuuid(
  puuid: string,
  options: { size?: number } = {},
): Promise<string[]> {
  const normalizedPuuid = puuid.trim();
  if (!normalizedPuuid) {
    throw new HttpError("puuid is required.", 400);
  }

  const payload = await requestRiotJson(
    `/val/match/v1/matchlists/by-puuid/${encodeURIComponent(normalizedPuuid)}`,
    {
      target: "routing",
      query: {
        size: options.size,
      },
    },
  );

  const matchIds = extractMatchIds(payload);
  const uniqueMatchIds = Array.from(new Set(matchIds));

  if (options.size && options.size > 0) {
    return uniqueMatchIds.slice(0, options.size);
  }

  return uniqueMatchIds;
}

export async function getRiotMatchById(matchId: string): Promise<RiotMatch> {
  const normalizedMatchId = matchId.trim();
  if (!normalizedMatchId) {
    throw new HttpError("matchId is required.", 400);
  }

  const payload = await requestRiotJson(
    `/val/match/v1/matches/${encodeURIComponent(normalizedMatchId)}`,
    { target: "routing" },
  );
  const root = asObject(payload, "match lookup");
  const matchInfo = asOptionalObject(root.matchInfo) ?? root;
  const teamsRaw = root.teams;
  const playersRaw = root.players;

  if (!Array.isArray(teamsRaw) || teamsRaw.length < 2) {
    throw new HttpError("Riot match response is missing team data.", 502);
  }

  if (!Array.isArray(playersRaw) || playersRaw.length === 0) {
    throw new HttpError("Riot match response is missing player data.", 502);
  }

  const teams = teamsRaw.map((entry, index) => normalizeTeam(entry, index));
  const players = playersRaw.map((entry, index) => normalizePlayer(entry, index));

  const riotMatchId = asRequiredString(
    matchInfo.matchId ?? root.matchId ?? normalizedMatchId,
    "matchId",
  );
  const startedAt = normalizeTimestamp(
    matchInfo.gameStartMillis ??
      matchInfo.gameStartTimeMillis ??
      matchInfo.gameStartTime,
  );
  const isCompleted =
    typeof matchInfo.isCompleted === "boolean"
      ? matchInfo.isCompleted
      : teams.some((team) => team.roundsWon > 0 || team.roundsLost > 0);

  return {
    riotMatchId,
    startedAt,
    isCompleted,
    teams,
    players,
  };
}
