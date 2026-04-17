"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyAdminGuardRedirect,
  applyAdminGuardStatusRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import type {
  EventRecord,
  MatchRecord,
  MvpSummary,
  PlayerStatRecord,
  TeamStandingAggregate,
} from "@/lib/domain/types";
import { buildRegistrationPath, formatEventStatus } from "@/app/dashboard/events/event-management-utils";

type EventsResponse =
  | {
      success: true;
      data: {
        events: EventRecord[];
      };
    }
  | {
      success: false;
      error: string;
    };

type EventMutationResponse =
  | {
      success: true;
      data: {
        event: EventRecord;
      };
    }
  | {
      success: false;
      error: string;
    };

type MatchesResponse =
  | {
      success: true;
      data: {
        matches: MatchRecord[];
      };
    }
  | {
      success: false;
      error: string;
    };

type MatchMutationResponse =
  | {
      success: true;
      data: {
        match: MatchRecord;
      };
    }
  | {
      success: false;
      error: string;
    };

type StandingsResponse =
  | {
      success: true;
      data: {
        standings: TeamStandingAggregate[];
      };
    }
  | {
      success: false;
      error: string;
    };

type PlayerStatsResponse =
  | {
      success: true;
      data: {
        playerStats: PlayerStatRecord[];
      };
    }
  | {
      success: false;
      error: string;
    };

type PlayerStatMutationResponse =
  | {
      success: true;
      data: {
        playerStat: PlayerStatRecord;
      };
    }
  | {
      success: false;
      error: string;
    };

type MvpSummaryResponse =
  | {
      success: true;
      data: {
        summary: MvpSummary | null;
      };
    }
  | {
      success: false;
      error: string;
    };

type RiotConfig = {
  configured: boolean;
  platformRegion: string;
  routingRegion: string;
};

type RiotConfigResponse =
  | {
      success: true;
      data: {
        config: RiotConfig;
      };
    }
  | {
      success: false;
      error: string;
    };

type RiotSyncSummary = {
  eventId: string;
  requestedMatchCount: number;
  processedMatchCount: number;
  upsertedMatches: number;
  upsertedPlayerStats: number;
  skippedMatchCount: number;
  standingsCount: number;
  warnings: string[];
};

type RiotSyncResponse =
  | {
      success: true;
      data: {
        sync: RiotSyncSummary;
      };
    }
  | {
      success: false;
      error: string;
    };

type EventFormState = {
  name: string;
  slug: string;
  code: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
};

const EMPTY_FORM_STATE: EventFormState = {
  name: "",
  slug: "",
  code: "",
  startsAt: "",
  endsAt: "",
  registrationOpensAt: "",
  registrationClosesAt: "",
};

type MatchFormState = {
  homeTeamId: string;
  awayTeamId: string;
  playedAt: string;
  status: MatchRecord["status"];
  homeScore: string;
  awayScore: string;
  homeRoundDiff: string;
  awayRoundDiff: string;
};

const EMPTY_MATCH_FORM_STATE: MatchFormState = {
  homeTeamId: "",
  awayTeamId: "",
  playedAt: "",
  status: "scheduled",
  homeScore: "0",
  awayScore: "0",
  homeRoundDiff: "0",
  awayRoundDiff: "0",
};

const MATCH_STATUS_OPTIONS: MatchRecord["status"][] = [
  "scheduled",
  "in_progress",
  "completed",
  "forfeit",
  "cancelled",
];

type PlayerStatFormState = {
  playerId: string;
  teamId: string;
  matchId: string;
  mapRef: string;
  kills: string;
  deaths: string;
  assists: string;
  matchesPlayed: string;
  mapsPlayed: string;
};

type PlayerStatsFilterState = {
  teamId: string;
  playerId: string;
};

const EMPTY_PLAYER_STAT_FORM_STATE: PlayerStatFormState = {
  playerId: "",
  teamId: "",
  matchId: "",
  mapRef: "",
  kills: "0",
  deaths: "0",
  assists: "0",
  matchesPlayed: "0",
  mapsPlayed: "0",
};

const EMPTY_PLAYER_STATS_FILTER_STATE: PlayerStatsFilterState = {
  teamId: "",
  playerId: "",
};

function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoValue(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

function formatMatchStatus(value: MatchRecord["status"]): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createRegistrationLinkToken(): string {
  if (typeof crypto === "undefined") {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resolveSelectedEventId(
  events: EventRecord[],
  selectedEventId: string,
): string {
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    return selectedEventId;
  }

  return events[0]?.id ?? "";
}

export type EventManagementSection =
  | "events"
  | "matches"
  | "leaderboard"
  | "playerStats"
  | "mvp"
  | "riotSync";

type EventManagementClientProps = {
  sections?: EventManagementSection[];
};

const DEFAULT_SECTIONS: EventManagementSection[] = [
  "events",
  "matches",
  "leaderboard",
  "playerStats",
  "mvp",
  "riotSync",
];

const SECTION_LABELS: Record<EventManagementSection, string> = {
  events: "Events",
  matches: "Matches",
  leaderboard: "Leaderboard",
  playerStats: "Player Stats",
  mvp: "MVP",
  riotSync: "Riot Sync",
};

export function EventManagementClient({
  sections = DEFAULT_SECTIONS,
}: EventManagementClientProps) {
  const router = useRouter();
  const visibleSections = new Set(sections);
  const showEvents = visibleSections.has("events");
  const showMatches = visibleSections.has("matches");
  const showLeaderboard = visibleSections.has("leaderboard");
  const showPlayerStats = visibleSections.has("playerStats");
  const showMvp = visibleSections.has("mvp");
  const showRiotSync = visibleSections.has("riotSync");
  const hasOperationsSection =
    showMatches || showLeaderboard || showPlayerStats || showMvp || showRiotSync;

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [formState, setFormState] = useState<EventFormState>(EMPTY_FORM_STATE);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [standings, setStandings] = useState<TeamStandingAggregate[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatRecord[]>([]);
  const [mvpSummary, setMvpSummary] = useState<MvpSummary | null>(null);
  const [playerStatsFilter, setPlayerStatsFilter] = useState<PlayerStatsFilterState>(
    EMPTY_PLAYER_STATS_FILTER_STATE,
  );
  const [matchFormState, setMatchFormState] =
    useState<MatchFormState>(EMPTY_MATCH_FORM_STATE);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [playerStatFormState, setPlayerStatFormState] = useState<PlayerStatFormState>(
    EMPTY_PLAYER_STAT_FORM_STATE,
  );
  const [editingPlayerStatId, setEditingPlayerStatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatchesLoading, setIsMatchesLoading] = useState(false);
  const [isStandingsLoading, setIsStandingsLoading] = useState(false);
  const [isPlayerStatsLoading, setIsPlayerStatsLoading] = useState(false);
  const [isMvpLoading, setIsMvpLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMatchSubmitting, setIsMatchSubmitting] = useState(false);
  const [isStandingsSubmitting, setIsStandingsSubmitting] = useState(false);
  const [isPlayerStatSubmitting, setIsPlayerStatSubmitting] = useState(false);
  const [isMvpSubmitting, setIsMvpSubmitting] = useState(false);
  const [isRiotConfigLoading, setIsRiotConfigLoading] = useState(false);
  const [isRiotSyncSubmitting, setIsRiotSyncSubmitting] = useState(false);
  const [actionPendingFor, setActionPendingFor] = useState<string | null>(null);
  const [copiedLinkFor, setCopiedLinkFor] = useState<string | null>(null);
  const [riotConfig, setRiotConfig] = useState<RiotConfig | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [matchErrorMessage, setMatchErrorMessage] = useState<string | null>(null);
  const [matchSuccessMessage, setMatchSuccessMessage] = useState<string | null>(null);
  const [standingsErrorMessage, setStandingsErrorMessage] = useState<string | null>(null);
  const [standingsSuccessMessage, setStandingsSuccessMessage] = useState<string | null>(null);
  const [playerStatsErrorMessage, setPlayerStatsErrorMessage] = useState<string | null>(null);
  const [playerStatsSuccessMessage, setPlayerStatsSuccessMessage] = useState<string | null>(
    null,
  );
  const [mvpErrorMessage, setMvpErrorMessage] = useState<string | null>(null);
  const [mvpSuccessMessage, setMvpSuccessMessage] = useState<string | null>(null);
  const [riotSyncErrorMessage, setRiotSyncErrorMessage] = useState<string | null>(null);
  const [riotSyncSuccessMessage, setRiotSyncSuccessMessage] = useState<string | null>(
    null,
  );
  const [riotSyncWarnings, setRiotSyncWarnings] = useState<string[]>([]);

  const activeEventId = resolveSelectedEventId(events, selectedEventId);
  const visibleMatches = activeEventId
    ? matches.filter((match) => match.eventId === activeEventId)
    : [];
  const visiblePlayerStats = activeEventId
    ? playerStats.filter((statLine) => statLine.eventId === activeEventId)
    : [];

  const applyAuthRedirect = useCallback(
    (statusCode: number, errorMessage: string): boolean =>
      applyAdminGuardStatusRedirect(router, statusCode, errorMessage),
    [router],
  );

  const fetchEvents = useCallback(async (): Promise<EventRecord[]> => {
    const response = await fetch("/api/admin/events?limit=100", { method: "GET" });
    const body = (await response.json()) as EventsResponse;

    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    return body.data.events;
  }, []);

  const fetchMatches = useCallback(async (eventId: string): Promise<MatchRecord[]> => {
    const query = new URLSearchParams({ eventId, limit: "100" });
    const response = await fetch(`/api/admin/matches?${query.toString()}`, {
      method: "GET",
    });
    const body = (await response.json()) as MatchesResponse;

    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    return body.data.matches;
  }, []);

  const fetchStandings = useCallback(
    async (eventId: string): Promise<TeamStandingAggregate[]> => {
      const query = new URLSearchParams({ eventId, limit: "100" });
      const response = await fetch(`/api/admin/leaderboard?${query.toString()}`, {
        method: "GET",
      });
      const body = (await response.json()) as StandingsResponse;

      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      return body.data.standings;
    },
    [],
  );

  const fetchPlayerStats = useCallback(
    async (
      eventId: string,
      filters: PlayerStatsFilterState,
    ): Promise<PlayerStatRecord[]> => {
      const query = new URLSearchParams({ eventId, limit: "100" });
      const normalizedTeamId = filters.teamId.trim();
      const normalizedPlayerId = filters.playerId.trim();

      if (normalizedTeamId) {
        query.set("teamId", normalizedTeamId);
      }

      if (normalizedPlayerId) {
        query.set("playerId", normalizedPlayerId);
      }

      const response = await fetch(`/api/admin/player-stats?${query.toString()}`, {
        method: "GET",
      });
      const body = (await response.json()) as PlayerStatsResponse;

      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      return body.data.playerStats;
    },
    [],
  );

  const fetchMvpSummary = useCallback(async (eventId: string): Promise<MvpSummary | null> => {
    const query = new URLSearchParams({ eventId });
    const response = await fetch(`/api/admin/mvp?${query.toString()}`, {
      method: "GET",
    });
    const body = (await response.json()) as MvpSummaryResponse;

    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    return body.data.summary;
  }, []);

  const fetchRiotConfig = useCallback(async (): Promise<RiotConfig> => {
    const response = await fetch("/api/admin/riot/config", {
      method: "GET",
    });
    const body = (await response.json()) as RiotConfigResponse;

    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    return body.data.config;
  }, []);

  const refreshEvents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextEvents = await fetchEvents();
      const nextSelectedEventId = resolveSelectedEventId(nextEvents, selectedEventId);

      setEvents(nextEvents);
      setSelectedEventId(nextSelectedEventId);

      if (!nextSelectedEventId) {
        setMatches([]);
        setStandings([]);
        setPlayerStats([]);
        setMvpSummary(null);
      } else {
        const [nextMatches, nextStandings, nextPlayerStats, nextMvpSummary] = await Promise.all([
          showMatches
            ? fetchMatches(nextSelectedEventId)
            : Promise.resolve([] as MatchRecord[]),
          showLeaderboard
            ? fetchStandings(nextSelectedEventId)
            : Promise.resolve([] as TeamStandingAggregate[]),
          showPlayerStats
            ? fetchPlayerStats(nextSelectedEventId, playerStatsFilter)
            : Promise.resolve([] as PlayerStatRecord[]),
          showMvp
            ? fetchMvpSummary(nextSelectedEventId)
            : Promise.resolve(null as MvpSummary | null),
        ]);
        setMatches(nextMatches);
        setStandings(nextStandings);
        setPlayerStats(nextPlayerStats);
        setMvpSummary(nextMvpSummary);
      }
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load events.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    fetchEvents,
    fetchMatches,
    fetchMvpSummary,
    fetchPlayerStats,
    fetchStandings,
    playerStatsFilter,
    router,
    selectedEventId,
    showLeaderboard,
    showMatches,
    showMvp,
    showPlayerStats,
  ]);

  const refreshMatches = useCallback(async (eventId: string) => {
    setIsMatchesLoading(true);
    setMatchErrorMessage(null);

    try {
      const nextMatches = await fetchMatches(eventId);
      setMatches(nextMatches);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setMatchErrorMessage(error.message);
      } else {
        setMatchErrorMessage("Unable to load matches.");
      }
    } finally {
      setIsMatchesLoading(false);
    }
  }, [fetchMatches, router]);

  const refreshStandings = useCallback(async (eventId: string) => {
    if (!eventId) {
      setStandings([]);
      return;
    }

    setIsStandingsLoading(true);
    setStandingsErrorMessage(null);

    try {
      const nextStandings = await fetchStandings(eventId);
      setStandings(nextStandings);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setStandingsErrorMessage(error.message);
      } else {
        setStandingsErrorMessage("Unable to load standings.");
      }
    } finally {
      setIsStandingsLoading(false);
    }
  }, [fetchStandings, router]);

  const refreshPlayerStats = useCallback(
    async (eventId: string, filters: PlayerStatsFilterState = playerStatsFilter) => {
      if (!eventId) {
        setPlayerStats([]);
        return;
      }

      setIsPlayerStatsLoading(true);
      setPlayerStatsErrorMessage(null);

      try {
        const nextPlayerStats = await fetchPlayerStats(eventId, filters);
        setPlayerStats(nextPlayerStats);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        if (error instanceof Error && error.message) {
          setPlayerStatsErrorMessage(error.message);
        } else {
          setPlayerStatsErrorMessage("Unable to load player stats.");
        }
      } finally {
        setIsPlayerStatsLoading(false);
      }
    },
    [fetchPlayerStats, playerStatsFilter, router],
  );

  const refreshMvpSummary = useCallback(
    async (eventId: string) => {
      if (!eventId) {
        setMvpSummary(null);
        return;
      }

      setIsMvpLoading(true);
      setMvpErrorMessage(null);

      try {
        const nextMvpSummary = await fetchMvpSummary(eventId);
        setMvpSummary(nextMvpSummary);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        if (error instanceof Error && error.message) {
          setMvpErrorMessage(error.message);
        } else {
          setMvpErrorMessage("Unable to load MVP summary.");
        }
      } finally {
        setIsMvpLoading(false);
      }
    },
    [fetchMvpSummary, router],
  );

  useEffect(() => {
    const run = async () => {
      try {
        const nextEvents = await fetchEvents();
        const nextSelectedEventId = resolveSelectedEventId(nextEvents, "");

        setEvents(nextEvents);
        setSelectedEventId(nextSelectedEventId);

        if (nextSelectedEventId) {
          const [nextMatches, nextStandings, nextPlayerStats, nextMvpSummary] =
            await Promise.all([
              showMatches
                ? fetchMatches(nextSelectedEventId)
                : Promise.resolve([] as MatchRecord[]),
              showLeaderboard
                ? fetchStandings(nextSelectedEventId)
                : Promise.resolve([] as TeamStandingAggregate[]),
              showPlayerStats
                ? fetchPlayerStats(nextSelectedEventId, EMPTY_PLAYER_STATS_FILTER_STATE)
                : Promise.resolve([] as PlayerStatRecord[]),
              showMvp
                ? fetchMvpSummary(nextSelectedEventId)
                : Promise.resolve(null as MvpSummary | null),
            ]);
          setMatches(nextMatches);
          setStandings(nextStandings);
          setPlayerStats(nextPlayerStats);
          setMvpSummary(nextMvpSummary);
        } else {
          setMatches([]);
          setStandings([]);
          setPlayerStats([]);
          setMvpSummary(null);
        }
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        if (error instanceof Error && error.message) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("Unable to load events.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [
    fetchEvents,
    fetchMatches,
    fetchMvpSummary,
    fetchPlayerStats,
    fetchStandings,
    router,
    showLeaderboard,
    showMatches,
    showMvp,
    showPlayerStats,
  ]);

  useEffect(() => {
    if (!showRiotSync) {
      return;
    }

    const run = async () => {
      setIsRiotConfigLoading(true);

      try {
        const config = await fetchRiotConfig();
        setRiotConfig(config);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        if (error instanceof Error && error.message) {
          setRiotSyncErrorMessage(error.message);
        } else {
          setRiotSyncErrorMessage("Unable to load Riot integration config.");
        }
      } finally {
        setIsRiotConfigLoading(false);
      }
    };

    void run();
  }, [fetchRiotConfig, router, showRiotSync]);

  function resetForm() {
    setFormState(EMPTY_FORM_STATE);
    setEditingEventId(null);
  }

  function startEditing(event: EventRecord) {
    setEditingEventId(event.id);
    setSuccessMessage(null);
    setErrorMessage(null);
    setFormState({
      name: event.name,
      slug: event.slug,
      code: event.code,
      startsAt: toDatetimeLocalValue(event.startsAt),
      endsAt: toDatetimeLocalValue(event.endsAt),
      registrationOpensAt: toDatetimeLocalValue(event.registrationOpensAt),
      registrationClosesAt: toDatetimeLocalValue(event.registrationClosesAt),
    });
  }

  function resetMatchForm() {
    setMatchFormState(EMPTY_MATCH_FORM_STATE);
    setEditingMatchId(null);
  }

  function startEditingMatch(match: MatchRecord) {
    setEditingMatchId(match.id);
    setMatchSuccessMessage(null);
    setMatchErrorMessage(null);
    setMatchFormState({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      playedAt: toDatetimeLocalValue(match.playedAt),
      status: match.status,
      homeScore: String(match.homeScore),
      awayScore: String(match.awayScore),
      homeRoundDiff: String(match.homeRoundDiff),
      awayRoundDiff: String(match.awayRoundDiff),
    });
  }

  function resetPlayerStatForm() {
    setPlayerStatFormState(EMPTY_PLAYER_STAT_FORM_STATE);
    setEditingPlayerStatId(null);
  }

  function startEditingPlayerStat(playerStat: PlayerStatRecord) {
    setEditingPlayerStatId(playerStat.id);
    setPlayerStatsSuccessMessage(null);
    setPlayerStatsErrorMessage(null);
    setPlayerStatFormState({
      playerId: playerStat.playerId,
      teamId: playerStat.teamId,
      matchId: playerStat.matchId ?? "",
      mapRef: playerStat.mapRef ?? "",
      kills: String(playerStat.kills),
      deaths: String(playerStat.deaths),
      assists: String(playerStat.assists),
      matchesPlayed: String(playerStat.matchesPlayed),
      mapsPlayed: String(playerStat.mapsPlayed),
    });
  }

  async function submitMatchForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeEventId) {
      setMatchErrorMessage("Select an event first.");
      return;
    }

    const editingMatch = editingMatchId
      ? visibleMatches.find((entry) => entry.id === editingMatchId)
      : null;

    setIsMatchSubmitting(true);
    setMatchErrorMessage(null);
    setMatchSuccessMessage(null);

    try {
      const payload = {
        eventId: activeEventId,
        homeTeamId: matchFormState.homeTeamId,
        awayTeamId: matchFormState.awayTeamId,
        playedAt: toIsoValue(matchFormState.playedAt),
        status: matchFormState.status,
        homeScore: Number(matchFormState.homeScore),
        awayScore: Number(matchFormState.awayScore),
        homeRoundDiff: Number(matchFormState.homeRoundDiff),
        awayRoundDiff: Number(matchFormState.awayRoundDiff),
      };

      const response = await fetch(
        editingMatch ? "/api/admin/matches/update" : "/api/admin/matches",
        {
          method: editingMatch ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingMatch
              ? {
                  matchId: editingMatch.id,
                  ...payload,
                }
              : payload,
          ),
        },
      );

      const body = (await response.json()) as MatchMutationResponse;
      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setMatchErrorMessage(body.error);
        return;
      }

      setMatches((currentMatches) => {
        const existingIndex = currentMatches.findIndex(
          (entry) => entry.id === body.data.match.id,
        );

        if (existingIndex < 0) {
          return [...currentMatches, body.data.match].sort(
            (left, right) =>
              new Date(left.playedAt).getTime() - new Date(right.playedAt).getTime(),
          );
        }

        const nextMatches = [...currentMatches];
        nextMatches[existingIndex] = body.data.match;
        return nextMatches.sort(
          (left, right) =>
            new Date(left.playedAt).getTime() - new Date(right.playedAt).getTime(),
        );
      });

      const nextStandings = await fetchStandings(activeEventId);
      setStandings(nextStandings);
      setStandingsErrorMessage(null);

      setMatchSuccessMessage(editingMatch ? "Match updated." : "Match saved.");
      resetMatchForm();
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setMatchErrorMessage(error.message);
      } else {
        setMatchErrorMessage("Unable to save match.");
      }
    } finally {
      setIsMatchSubmitting(false);
    }
  }

  async function submitPlayerStatForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeEventId) {
      setPlayerStatsErrorMessage("Select an event first.");
      return;
    }

    const editingPlayerStat = editingPlayerStatId
      ? visiblePlayerStats.find((entry) => entry.id === editingPlayerStatId)
      : null;

    setIsPlayerStatSubmitting(true);
    setPlayerStatsErrorMessage(null);
    setPlayerStatsSuccessMessage(null);

    try {
      const payload = {
        eventId: activeEventId,
        playerId: playerStatFormState.playerId,
        teamId: playerStatFormState.teamId,
        matchId: playerStatFormState.matchId.trim() || undefined,
        mapRef: playerStatFormState.mapRef.trim() || undefined,
        kills: Number(playerStatFormState.kills),
        deaths: Number(playerStatFormState.deaths),
        assists: Number(playerStatFormState.assists),
        matchesPlayed: Number(playerStatFormState.matchesPlayed),
        mapsPlayed: Number(playerStatFormState.mapsPlayed),
      };

      const response = await fetch(
        editingPlayerStat ? "/api/admin/player-stats/update" : "/api/admin/player-stats",
        {
          method: editingPlayerStat ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingPlayerStat
              ? {
                  playerStatId: editingPlayerStat.id,
                  ...payload,
                }
              : payload,
          ),
        },
      );

      const body = (await response.json()) as PlayerStatMutationResponse;
      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setPlayerStatsErrorMessage(body.error);
        return;
      }

      const nextPlayerStats = await fetchPlayerStats(activeEventId, playerStatsFilter);
      setPlayerStats(nextPlayerStats);
      setPlayerStatsSuccessMessage(
        editingPlayerStat ? "Player stat updated." : "Player stat saved.",
      );
      resetPlayerStatForm();
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setPlayerStatsErrorMessage(error.message);
      } else {
        setPlayerStatsErrorMessage("Unable to save player stat.");
      }
    } finally {
      setIsPlayerStatSubmitting(false);
    }
  }

  async function submitEventForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const editingEvent = editingEventId
      ? events.find((entry) => entry.id === editingEventId)
      : null;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = {
        name: formState.name,
        slug: formState.slug,
        code: formState.code,
        startsAt: toIsoValue(formState.startsAt),
        endsAt: toIsoValue(formState.endsAt),
        registrationOpensAt: toIsoValue(formState.registrationOpensAt),
        registrationClosesAt: toIsoValue(formState.registrationClosesAt),
      };

      const response = await fetch(
        editingEvent ? "/api/admin/events/update" : "/api/admin/events",
        {
          method: editingEvent ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingEvent
              ? {
                  eventId: editingEvent.id,
                  status: editingEvent.status,
                  ...payload,
                }
              : payload,
          ),
        },
      );

      const body = (await response.json()) as EventMutationResponse;
      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setErrorMessage(body.error);
        return;
      }

      setEvents((currentEvents) => {
        const existingIndex = currentEvents.findIndex(
          (entry) => entry.id === body.data.event.id,
        );

        if (existingIndex < 0) {
          return [body.data.event, ...currentEvents];
        }

        const nextEvents = [...currentEvents];
        nextEvents[existingIndex] = body.data.event;
        return nextEvents;
      });

      setSuccessMessage(editingEvent ? "Event updated." : "Event created.");
      resetForm();
    } catch {
      setErrorMessage("Unable to save event.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runStateTransition(
    endpoint: "/api/admin/events/publish" | "/api/admin/events/archive",
    eventId: string,
  ) {
    setActionPendingFor(eventId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const body = (await response.json()) as EventMutationResponse;

      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setErrorMessage(body.error);
        return;
      }

      setEvents((currentEvents) =>
        currentEvents.map((entry) =>
          entry.id === body.data.event.id ? body.data.event : entry,
        ),
      );
      setSuccessMessage(
        endpoint === "/api/admin/events/publish"
          ? "Event published."
          : "Event archived.",
      );
    } catch {
      setErrorMessage("Unable to update event state.");
    } finally {
      setActionPendingFor(null);
    }
  }

  async function regenerateRegistrationLink(event: EventRecord) {
    setActionPendingFor(event.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCopiedLinkFor(null);

    const registrationLinkToken = createRegistrationLinkToken();

    try {
      const response = await fetch("/api/admin/events/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          registrationLinkToken,
          registrationLinkMeta: {
            generatedAt: new Date().toISOString(),
          },
        }),
      });
      const body = (await response.json()) as EventMutationResponse;

      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setErrorMessage(body.error);
        return;
      }

      setEvents((currentEvents) =>
        currentEvents.map((entry) =>
          entry.id === body.data.event.id ? body.data.event : entry,
        ),
      );
      setSuccessMessage(
        event.registrationLinkToken
          ? "Registration link regenerated."
          : "Registration link generated.",
      );
    } catch {
      setErrorMessage("Unable to update registration link.");
    } finally {
      setActionPendingFor(null);
    }
  }

  async function copyRegistrationLink(event: EventRecord) {
    const token = event.registrationLinkToken?.trim();
    if (!token) {
      setErrorMessage("Generate a registration link first.");
      return;
    }

    const registrationPath = buildRegistrationPath(event.id, token);
    const registrationUrl =
      typeof window === "undefined"
        ? registrationPath
        : `${window.location.origin}${registrationPath}`;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard not available");
      }

      await navigator.clipboard.writeText(registrationUrl);
      setCopiedLinkFor(event.id);
      setErrorMessage(null);
      setSuccessMessage("Registration link copied.");
    } catch {
      setErrorMessage(`Unable to copy link. Share this: ${registrationUrl}`);
    }
  }

  function onSelectEventForMatches(eventId: string) {
    setSelectedEventId(eventId);
    setMatchErrorMessage(null);
    setMatchSuccessMessage(null);
    setStandingsErrorMessage(null);
    setStandingsSuccessMessage(null);
    setPlayerStatsErrorMessage(null);
    setPlayerStatsSuccessMessage(null);
    setMvpErrorMessage(null);
    setMvpSuccessMessage(null);
    setRiotSyncErrorMessage(null);
    setRiotSyncSuccessMessage(null);
    setRiotSyncWarnings([]);
    setPlayerStatsFilter(EMPTY_PLAYER_STATS_FILTER_STATE);
    resetMatchForm();
    resetPlayerStatForm();

    if (!eventId) {
      setMatches([]);
      setStandings([]);
      setPlayerStats([]);
      setMvpSummary(null);
      return;
    }

    if (showMatches) {
      void refreshMatches(eventId);
    }
    if (showLeaderboard) {
      void refreshStandings(eventId);
    }
    if (showPlayerStats) {
      void refreshPlayerStats(eventId, EMPTY_PLAYER_STATS_FILTER_STATE);
    }
    if (showMvp) {
      void refreshMvpSummary(eventId);
    }
  }

  function applyPlayerStatsFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeEventId) {
      setPlayerStatsErrorMessage("Select an event first.");
      return;
    }

    setEditingPlayerStatId(null);
    void refreshPlayerStats(activeEventId, playerStatsFilter);
  }

  function clearPlayerStatsFilters() {
    if (!activeEventId) {
      setPlayerStatsFilter(EMPTY_PLAYER_STATS_FILTER_STATE);
      setPlayerStats([]);
      return;
    }

    setPlayerStatsFilter(EMPTY_PLAYER_STATS_FILTER_STATE);
    setEditingPlayerStatId(null);
    setPlayerStatsErrorMessage(null);
    void refreshPlayerStats(activeEventId, EMPTY_PLAYER_STATS_FILTER_STATE);
  }

  async function refreshRiotConfigStatus() {
    setIsRiotConfigLoading(true);
    setRiotSyncErrorMessage(null);

    try {
      const config = await fetchRiotConfig();
      setRiotConfig(config);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setRiotSyncErrorMessage(error.message);
      } else {
        setRiotSyncErrorMessage("Unable to load Riot integration config.");
      }
    } finally {
      setIsRiotConfigLoading(false);
    }
  }

  async function runRiotSync() {
    if (!activeEventId) {
      setRiotSyncErrorMessage("Select an event first.");
      return;
    }

    setIsRiotSyncSubmitting(true);
    setRiotSyncErrorMessage(null);
    setRiotSyncSuccessMessage(null);
    setRiotSyncWarnings([]);

    try {
      const response = await fetch("/api/admin/riot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: activeEventId,
        }),
      });
      const body = (await response.json()) as RiotSyncResponse;

      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setRiotSyncErrorMessage(body.error);
        return;
      }

      const syncSummary = body.data.sync;
      setRiotSyncWarnings(syncSummary.warnings);
      setRiotSyncSuccessMessage(
        `Synced ${syncSummary.upsertedMatches} matches and ${syncSummary.upsertedPlayerStats} player stat rows.`,
      );

      await Promise.all([
        showMatches ? refreshMatches(activeEventId) : Promise.resolve(),
        showLeaderboard ? refreshStandings(activeEventId) : Promise.resolve(),
        showPlayerStats ? refreshPlayerStats(activeEventId) : Promise.resolve(),
        showRiotSync ? refreshRiotConfigStatus() : Promise.resolve(),
      ]);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setRiotSyncErrorMessage(error.message);
      } else {
        setRiotSyncErrorMessage("Unable to sync Riot data.");
      }
    } finally {
      setIsRiotSyncSubmitting(false);
    }
  }

  async function recomputeStandings() {
    if (!activeEventId) {
      setStandingsErrorMessage("Select an event first.");
      return;
    }

    setIsStandingsSubmitting(true);
    setStandingsErrorMessage(null);
    setStandingsSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/leaderboard/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: activeEventId }),
      });
      const body = (await response.json()) as StandingsResponse;

      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setStandingsErrorMessage(body.error);
        return;
      }

      setStandings(body.data.standings);
      setStandingsSuccessMessage("Standings recomputed.");
    } catch {
      setStandingsErrorMessage("Unable to recompute standings.");
    } finally {
      setIsStandingsSubmitting(false);
    }
  }

  async function recomputeMvpSummary() {
    if (!activeEventId) {
      setMvpErrorMessage("Select an event first.");
      return;
    }

    setIsMvpSubmitting(true);
    setMvpErrorMessage(null);
    setMvpSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/mvp/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: activeEventId }),
      });
      const body = (await response.json()) as MvpSummaryResponse;

      if (!body.success) {
        if (applyAuthRedirect(response.status, body.error)) {
          return;
        }

        setMvpErrorMessage(body.error);
        return;
      }

      setMvpSummary(body.data.summary);
      setMvpSuccessMessage("MVP summary recomputed.");
    } catch {
      setMvpErrorMessage("Unable to recompute MVP summary.");
    } finally {
      setIsMvpSubmitting(false);
    }
  }

  const visibleOperationSections = (
    ["matches", "leaderboard", "playerStats", "mvp", "riotSync"] as const
  ).filter((section) => visibleSections.has(section));
  const operationsTitle =
    visibleOperationSections.length === 1
      ? SECTION_LABELS[visibleOperationSections[0]]
      : "Operations";

  return (
    <div className="space-y-8">
      {showEvents ? (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">
          {editingEventId ? "Edit Event" : "Create Event"}
        </h2>
        <form onSubmit={(event) => void submitEventForm(event)} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Name</span>
              <input
                required
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Slug</span>
              <input
                required
                value={formState.slug}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, slug: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Code</span>
              <input
                required
                value={formState.code}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, code: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Registration Opens</span>
              <input
                required
                type="datetime-local"
                value={formState.registrationOpensAt}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    registrationOpensAt: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Registration Closes</span>
              <input
                required
                type="datetime-local"
                value={formState.registrationClosesAt}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    registrationClosesAt: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Starts At</span>
              <input
                required
                type="datetime-local"
                value={formState.startsAt}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, startsAt: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Ends At</span>
              <input
                required
                type="datetime-local"
                value={formState.endsAt}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, endsAt: event.target.value }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isSubmitting
                ? "Saving..."
                : editingEventId
                  ? "Save Event Changes"
                  : "Create Event"}
            </button>
            {editingEventId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshEvents()}
              disabled={isLoading}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
            >
              {isLoading ? "Refreshing..." : "Refresh Events"}
            </button>
          </div>
        </form>
      </section>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              {successMessage}
            </p>
          ) : null}
        </>
      ) : null}

      {hasOperationsSection ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{operationsTitle}</h2>
            {showMatches ? (
              <button
                type="button"
                onClick={() => void refreshMatches(activeEventId)}
                disabled={!activeEventId || isMatchesLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                {isMatchesLoading ? "Loading..." : "Refresh Matches"}
              </button>
            ) : null}
          </div>

        <div className="mt-4">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">Target Event</span>
            <select
              value={activeEventId}
              onChange={(event) => onSelectEventForMatches(event.target.value)}
              disabled={events.length === 0}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {events.length === 0 ? <option value="">No events available</option> : null}
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} ({event.code})
                </option>
              ))}
            </select>
          </label>
        </div>
        {!showEvents && isLoading ? (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            Loading events...
          </p>
        ) : null}
        {!showEvents && !isLoading && events.length === 0 ? (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            No events are available yet. Create an event from the Events section first.
          </p>
        ) : null}
        {!showEvents && errorMessage ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {showRiotSync ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Riot Sync</h3>
              <button
                type="button"
                onClick={() => void refreshRiotConfigStatus()}
                disabled={isRiotConfigLoading}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                {isRiotConfigLoading ? "Checking..." : "Refresh Riot Config"}
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Riot API status:{" "}
                <span className="font-medium">
                  {riotConfig?.configured ? "Configured" : "Not configured"}
                </span>
              {riotConfig ? (
                <>
                  {" "}
                  ({riotConfig.platformRegion} platform / {riotConfig.routingRegion} routing)
                </>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runRiotSync()}
                disabled={!activeEventId || isRiotSyncSubmitting}
                className="rounded-md bg-indigo-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isRiotSyncSubmitting ? "Syncing..." : "Sync Riot Data"}
              </button>
              <p className="text-xs text-zinc-500">
                Manual match and player stats entry remains available regardless of Riot sync.
              </p>
            </div>
            {riotSyncErrorMessage ? (
              <p className="mt-3 text-sm text-red-600">{riotSyncErrorMessage}</p>
            ) : null}
            {riotSyncSuccessMessage ? (
              <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
                {riotSyncSuccessMessage}
              </p>
            ) : null}
            {riotSyncWarnings.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300">
                {riotSyncWarnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {showMatches ? (
          <>
            {matchErrorMessage ? <p className="mt-4 text-sm text-red-600">{matchErrorMessage}</p> : null}
            {matchSuccessMessage ? (
              <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">
                {matchSuccessMessage}
              </p>
            ) : null}

            <form onSubmit={(event) => void submitMatchForm(event)} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Home Team ID</span>
              <input
                required
                value={matchFormState.homeTeamId}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    homeTeamId: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Away Team ID</span>
              <input
                required
                value={matchFormState.awayTeamId}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    awayTeamId: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Played At</span>
              <input
                required
                type="datetime-local"
                value={matchFormState.playedAt}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    playedAt: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Status</span>
              <select
                value={matchFormState.status}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    status: event.target.value as MatchRecord["status"],
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {MATCH_STATUS_OPTIONS.map((statusOption) => (
                  <option key={statusOption} value={statusOption}>
                    {formatMatchStatus(statusOption)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Home Score</span>
              <input
                required
                min={0}
                step={1}
                type="number"
                value={matchFormState.homeScore}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    homeScore: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Away Score</span>
              <input
                required
                min={0}
                step={1}
                type="number"
                value={matchFormState.awayScore}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    awayScore: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Home Round Diff</span>
              <input
                required
                step={1}
                type="number"
                value={matchFormState.homeRoundDiff}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    homeRoundDiff: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Away Round Diff</span>
              <input
                required
                step={1}
                type="number"
                value={matchFormState.awayRoundDiff}
                onChange={(event) =>
                  setMatchFormState((current) => ({
                    ...current,
                    awayRoundDiff: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isMatchSubmitting || !activeEventId}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isMatchSubmitting
                ? "Saving..."
                : editingMatchId
                  ? "Save Match Changes"
                  : "Create Match"}
            </button>
            {editingMatchId ? (
              <button
                type="button"
                onClick={resetMatchForm}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
            </form>

            <div className="mt-6 space-y-3">
          <h3 className="text-lg font-semibold">Matches</h3>
          {isMatchesLoading ? <p className="text-sm text-zinc-500">Loading matches...</p> : null}
          {!activeEventId ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Select an event to view and manage matches.
            </p>
          ) : null}
          {!isMatchesLoading && activeEventId && visibleMatches.length === 0 ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              No matches found for the selected event.
            </p>
          ) : null}
          <div className="grid gap-3">
            {visibleMatches.map((match) => (
              <article
                key={match.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs text-zinc-500">{match.id}</p>
                  <p className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {formatMatchStatus(match.status)}
                  </p>
                </div>
                <p className="mt-2 text-sm font-medium">
                  {match.homeTeamId} vs {match.awayTeamId}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Played: {new Date(match.playedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Score {match.homeScore}-{match.awayScore} | Round Diff{" "}
                  {match.homeRoundDiff}/{match.awayRoundDiff}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => startEditingMatch(match)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    Edit Match
                  </button>
                </div>
              </article>
            ))}
          </div>
            </div>
          </>
        ) : null}

        {showLeaderboard ? (
          <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Leaderboard Standings</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshStandings(activeEventId)}
                disabled={!activeEventId || isStandingsLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                {isStandingsLoading ? "Loading..." : "Refresh Standings"}
              </button>
              <button
                type="button"
                onClick={() => void recomputeStandings()}
                disabled={!activeEventId || isStandingsSubmitting}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isStandingsSubmitting ? "Recomputing..." : "Recompute Standings"}
              </button>
            </div>
          </div>

          {standingsErrorMessage ? (
            <p className="text-sm text-red-600">{standingsErrorMessage}</p>
          ) : null}
          {standingsSuccessMessage ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {standingsSuccessMessage}
            </p>
          ) : null}
          {isStandingsLoading ? (
            <p className="text-sm text-zinc-500">Loading standings...</p>
          ) : null}

          {!activeEventId ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Select an event to view standings.
            </p>
          ) : null}

          {activeEventId && !isStandingsLoading && standings.length === 0 ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              No standings found for the selected event.
            </p>
          ) : null}

          {activeEventId && standings.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                <thead className="bg-zinc-50 dark:bg-zinc-950">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      #
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Team
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Wins
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Losses
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Played
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Round Diff
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {standings.map((standing, index) => (
                    <tr key={standing.teamId}>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{standing.teamName}</p>
                        <p className="font-mono text-xs text-zinc-500">{standing.teamId}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{standing.wins}</td>
                      <td className="px-3 py-2 text-right">{standing.losses}</td>
                      <td className="px-3 py-2 text-right">{standing.matchesPlayed}</td>
                      <td className="px-3 py-2 text-right">{standing.roundDiff}</td>
                      <td className="px-3 py-2 text-right">
                        {standing.points ?? "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          </div>
        ) : null}

        {showMvp ? (
          <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">MVP</h3>
              <p className="text-xs text-zinc-500">
                Score = (2 x kills) + (1.5 x assists) - (1.25 x deaths) + (3 x matches) +
                (0.5 x roundDiff) + (0.75 x points)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshMvpSummary(activeEventId)}
                disabled={!activeEventId || isMvpLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                {isMvpLoading ? "Loading..." : "Refresh MVP"}
              </button>
              <button
                type="button"
                onClick={() => void recomputeMvpSummary()}
                disabled={!activeEventId || isMvpSubmitting}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isMvpSubmitting ? "Recomputing..." : "Recompute MVP"}
              </button>
            </div>
          </div>

          {mvpErrorMessage ? <p className="text-sm text-red-600">{mvpErrorMessage}</p> : null}
          {mvpSuccessMessage ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {mvpSuccessMessage}
            </p>
          ) : null}
          {isMvpLoading ? <p className="text-sm text-zinc-500">Loading MVP summary...</p> : null}

          {!activeEventId ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Select an event to view MVP results.
            </p>
          ) : null}

          {activeEventId && !isMvpLoading && !mvpSummary ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              No MVP summary found. Recompute MVP to generate candidates.
            </p>
          ) : null}

          {activeEventId && mvpSummary?.topCandidate ? (
            <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
              <h4 className="text-base font-semibold">Top MVP Candidate</h4>
              <p className="mt-2 font-mono text-sm">{mvpSummary.topCandidate.playerId}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Team {mvpSummary.topCandidate.teamId} • Score{" "}
                {mvpSummary.topCandidate.score.toFixed(3)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Generated: {new Date(mvpSummary.generatedAt).toLocaleString()}
              </p>
            </article>
          ) : null}

          {activeEventId && mvpSummary && mvpSummary.candidates.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                <thead className="bg-zinc-50 dark:bg-zinc-950">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Rank
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Player
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Team
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      K
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      D
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      A
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Matches
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Round Diff
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Points
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {mvpSummary.candidates.map((candidate) => (
                    <tr key={`${candidate.playerId}-${candidate.teamId}`}>
                      <td className="px-3 py-2 text-right">{candidate.rank}</td>
                      <td className="px-3 py-2 font-mono text-xs">{candidate.playerId}</td>
                      <td className="px-3 py-2 font-mono text-xs">{candidate.teamId}</td>
                      <td className="px-3 py-2 text-right">{candidate.kills}</td>
                      <td className="px-3 py-2 text-right">{candidate.deaths}</td>
                      <td className="px-3 py-2 text-right">{candidate.assists}</td>
                      <td className="px-3 py-2 text-right">{candidate.matchesPlayed}</td>
                      <td className="px-3 py-2 text-right">{candidate.roundDiff}</td>
                      <td className="px-3 py-2 text-right">
                        {candidate.points ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-right">{candidate.score.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          </div>
        ) : null}

        {showPlayerStats ? (
          <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Player Stats</h3>
            <button
              type="button"
              onClick={() => void refreshPlayerStats(activeEventId)}
              disabled={!activeEventId || isPlayerStatsLoading}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
            >
              {isPlayerStatsLoading ? "Loading..." : "Refresh Player Stats"}
            </button>
          </div>

          <form onSubmit={applyPlayerStatsFilters} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Filter Team ID</span>
              <input
                value={playerStatsFilter.teamId}
                onChange={(event) =>
                  setPlayerStatsFilter((current) => ({
                    ...current,
                    teamId: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-300">Filter Player ID</span>
              <input
                value={playerStatsFilter.playerId}
                onChange={(event) =>
                  setPlayerStatsFilter((current) => ({
                    ...current,
                    playerId: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={!activeEventId || isPlayerStatsLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={clearPlayerStatsFilters}
                disabled={!activeEventId || isPlayerStatsLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
              >
                Clear Filters
              </button>
            </div>
          </form>

          {playerStatsErrorMessage ? (
            <p className="text-sm text-red-600">{playerStatsErrorMessage}</p>
          ) : null}
          {playerStatsSuccessMessage ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {playerStatsSuccessMessage}
            </p>
          ) : null}
          {isPlayerStatsLoading ? (
            <p className="text-sm text-zinc-500">Loading player stats...</p>
          ) : null}

          <form onSubmit={(event) => void submitPlayerStatForm(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Player ID</span>
                <input
                  required
                  value={playerStatFormState.playerId}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      playerId: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Team ID</span>
                <input
                  required
                  value={playerStatFormState.teamId}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      teamId: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Match ID (optional)</span>
                <input
                  value={playerStatFormState.matchId}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      matchId: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Map Ref (optional)</span>
                <input
                  value={playerStatFormState.mapRef}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      mapRef: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Kills</span>
                <input
                  required
                  min={0}
                  step={1}
                  type="number"
                  value={playerStatFormState.kills}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      kills: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Deaths</span>
                <input
                  required
                  min={0}
                  step={1}
                  type="number"
                  value={playerStatFormState.deaths}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      deaths: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Assists</span>
                <input
                  required
                  min={0}
                  step={1}
                  type="number"
                  value={playerStatFormState.assists}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      assists: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Matches Played</span>
                <input
                  required
                  min={0}
                  step={1}
                  type="number"
                  value={playerStatFormState.matchesPlayed}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      matchesPlayed: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Maps Played</span>
                <input
                  required
                  min={0}
                  step={1}
                  type="number"
                  value={playerStatFormState.mapsPlayed}
                  onChange={(event) =>
                    setPlayerStatFormState((current) => ({
                      ...current,
                      mapsPlayed: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!activeEventId || isPlayerStatSubmitting}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isPlayerStatSubmitting
                  ? "Saving..."
                  : editingPlayerStatId
                    ? "Save Player Stat Changes"
                    : "Create Player Stat"}
              </button>
              {editingPlayerStatId ? (
                <button
                  type="button"
                  onClick={resetPlayerStatForm}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>

          {!activeEventId ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Select an event to manage player stats.
            </p>
          ) : null}
          {activeEventId && !isPlayerStatsLoading && visiblePlayerStats.length === 0 ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              No player stats found for the selected filters.
            </p>
          ) : null}

          {activeEventId && visiblePlayerStats.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                <thead className="bg-zinc-50 dark:bg-zinc-950">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Player
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Team
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      K
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      D
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      A
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Matches
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Maps
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Match Ref
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                      Map Ref
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {visiblePlayerStats.map((playerStat) => (
                    <tr key={playerStat.id}>
                      <td className="px-3 py-2 font-mono text-xs">{playerStat.playerId}</td>
                      <td className="px-3 py-2 font-mono text-xs">{playerStat.teamId}</td>
                      <td className="px-3 py-2 text-right">{playerStat.kills}</td>
                      <td className="px-3 py-2 text-right">{playerStat.deaths}</td>
                      <td className="px-3 py-2 text-right">{playerStat.assists}</td>
                      <td className="px-3 py-2 text-right">{playerStat.matchesPlayed}</td>
                      <td className="px-3 py-2 text-right">{playerStat.mapsPlayed}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {playerStat.matchId ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {playerStat.mapRef ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEditingPlayerStat(playerStat)}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {showEvents ? (
        <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Events</h2>
        {isLoading ? <p className="text-sm text-zinc-500">Loading events...</p> : null}

        {!isLoading && events.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            No events found.
          </p>
        ) : null}

        <div className="grid gap-4">
          {events.map((event) => {
            const isPending = actionPendingFor === event.id;
            const canPublish =
              event.status === "draft" || event.status === "registration_closed";
            const canArchive = event.status !== "archived";
            const registrationLinkPath = event.registrationLinkToken
              ? buildRegistrationPath(event.id, event.registrationLinkToken)
              : null;

            return (
              <article
                key={event.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{event.name}</h3>
                  <p className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {formatEventStatus(event.status)}
                  </p>
                </div>
                <div className="mt-3 grid gap-1 text-sm text-zinc-600 dark:text-zinc-300">
                  <p>
                    <span className="font-medium">ID:</span>{" "}
                    <span className="font-mono">{event.id}</span>
                  </p>
                  <p>
                    <span className="font-medium">Slug:</span> {event.slug}
                  </p>
                  <p>
                    <span className="font-medium">Code:</span> {event.code}
                  </p>
                  <p>
                    <span className="font-medium">Registration Window:</span>{" "}
                    {new Date(event.registrationOpensAt).toLocaleString()} -{" "}
                    {new Date(event.registrationClosesAt).toLocaleString()}
                  </p>
                  <p>
                    <span className="font-medium">Event Window:</span>{" "}
                    {new Date(event.startsAt).toLocaleString()} -{" "}
                    {new Date(event.endsAt).toLocaleString()}
                  </p>
                  <div className="mt-2 rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-700">
                    <p className="font-medium text-sm">Registration Link</p>
                    {registrationLinkPath ? (
                      <>
                        <p className="mt-1 break-all font-mono">{registrationLinkPath}</p>
                        <p className="mt-1 text-zinc-500">
                          Share this link to enforce event-scoped registration.
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-zinc-500">
                        No registration link generated yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startEditing(event)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-70 dark:border-zinc-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !canPublish}
                    onClick={() => void runStateTransition("/api/admin/events/publish", event.id)}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void regenerateRegistrationLink(event)}
                    className="rounded-md border border-indigo-300 px-3 py-2 text-sm text-indigo-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-indigo-800 dark:text-indigo-300"
                  >
                    {event.registrationLinkToken ? "Regenerate Link" : "Generate Link"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !registrationLinkPath}
                    onClick={() => void copyRegistrationLink(event)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
                  >
                    {copiedLinkFor === event.id ? "Copied" : "Copy Link"}
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !canArchive}
                    onClick={() => void runStateTransition("/api/admin/events/archive", event.id)}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-800 dark:text-red-300"
                  >
                    Archive
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        </section>
      ) : null}
    </div>
  );
}
