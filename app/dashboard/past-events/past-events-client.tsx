"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AUTH_REQUIRED_CODE,
  MFA_REQUIRED_CODE,
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import type {
  EventRecord,
  MatchRecord,
  MvpSummary,
  TeamStandingAggregate,
} from "@/lib/domain/types";
import {
  buildRegistrationPath,
  formatEventStatus,
} from "@/app/dashboard/events/event-management-utils";

const PAST_EVENT_STATUSES = ["archived", "completed"] as const;

type PastEventStatus = (typeof PAST_EVENT_STATUSES)[number];
type PastEventStatusFilter = "all" | PastEventStatus;
type MessageTone = "error" | "success";

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

function resolveSelectedEventId(events: EventRecord[], selectedEventId: string): string {
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    return selectedEventId;
  }

  return events[0]?.id ?? "";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function formatMatchStatus(value: MatchRecord["status"]): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMatchResultLabel(match: MatchRecord): string {
  if (match.homeScore === match.awayScore) {
    return "Draw";
  }

  return match.homeScore > match.awayScore ? "Home Win" : "Away Win";
}

function hasAuthCodeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === AUTH_REQUIRED_CODE || error.message === MFA_REQUIRED_CODE)
  );
}

export function PastEventsClient() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PastEventStatusFilter>("all");
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [eventsErrorMessage, setEventsErrorMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [standings, setStandings] = useState<TeamStandingAggregate[]>([]);
  const [mvpSummary, setMvpSummary] = useState<MvpSummary | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsReloadNonce, setDetailsReloadNonce] = useState(0);
  const [matchesErrorMessage, setMatchesErrorMessage] = useState<string | null>(null);
  const [standingsErrorMessage, setStandingsErrorMessage] = useState<string | null>(null);
  const [mvpErrorMessage, setMvpErrorMessage] = useState<string | null>(null);
  const [metadataMessage, setMetadataMessage] = useState<{
    text: string;
    tone: MessageTone;
  } | null>(null);
  const [copiedLinkFor, setCopiedLinkFor] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return events
      .filter((event) =>
        statusFilter === "all" ? true : event.status === statusFilter,
      )
      .filter((event) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          event.name.toLowerCase().includes(normalizedSearch) ||
          event.code.toLowerCase().includes(normalizedSearch) ||
          event.slug.toLowerCase().includes(normalizedSearch) ||
          event.id.toLowerCase().includes(normalizedSearch)
        );
      });
  }, [events, searchQuery, statusFilter]);

  const activeEventId = resolveSelectedEventId(filteredEvents, selectedEventId);
  const activeEvent = useMemo(
    () => filteredEvents.find((event) => event.id === activeEventId) ?? null,
    [activeEventId, filteredEvents],
  );
  const sortedMatches = useMemo(
    () =>
      [...matches].sort(
        (first, second) =>
          new Date(second.playedAt).getTime() - new Date(first.playedAt).getTime(),
      ),
    [matches],
  );
  const matchSummary = useMemo(() => {
    const teams = new Set<string>();
    let completedMatches = 0;
    let forfeitMatches = 0;
    let cancelledMatches = 0;

    for (const match of matches) {
      teams.add(match.homeTeamId);
      teams.add(match.awayTeamId);

      if (match.status === "completed") {
        completedMatches += 1;
      } else if (match.status === "forfeit") {
        forfeitMatches += 1;
      } else if (match.status === "cancelled") {
        cancelledMatches += 1;
      }
    }

    return {
      totalMatches: matches.length,
      completedMatches,
      forfeitMatches,
      cancelledMatches,
      teamCount: teams.size,
    };
  }, [matches]);

  const handleAuthError = useCallback(
    (error: unknown): boolean => applyAdminGuardRedirect(router, error),
    [router],
  );

  const fetchEventsByStatus = useCallback(async (status: PastEventStatus): Promise<EventRecord[]> => {
    const query = new URLSearchParams({ status, limit: "100" });
    const response = await fetch(`/api/admin/events?${query.toString()}`, {
      method: "GET",
    });
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

  const fetchStandings = useCallback(async (eventId: string): Promise<TeamStandingAggregate[]> => {
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
  }, []);

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

  const fetchPastEvents = useCallback(async (): Promise<EventRecord[]> => {
    const fetchedEventGroups = await Promise.all(
      PAST_EVENT_STATUSES.map((status) => fetchEventsByStatus(status)),
    );
    const uniqueEvents = new Map<string, EventRecord>();

    for (const event of fetchedEventGroups.flat()) {
      uniqueEvents.set(event.id, event);
    }

    return [...uniqueEvents.values()].sort(
      (first, second) =>
        new Date(second.endsAt).getTime() - new Date(first.endsAt).getTime(),
    );
  }, [fetchEventsByStatus]);

  const refreshPastEvents = useCallback(async () => {
    setIsEventsLoading(true);
    setEventsErrorMessage(null);

    try {
      const nextEvents = await fetchPastEvents();
      setEvents(nextEvents);
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setEventsErrorMessage(error.message);
      } else {
        setEventsErrorMessage("Unable to load past events.");
      }
    } finally {
      setIsEventsLoading(false);
    }
  }, [fetchPastEvents, handleAuthError]);

  useEffect(() => {
    const run = async () => {
      setIsEventsLoading(true);
      setEventsErrorMessage(null);

      try {
        const nextEvents = await fetchPastEvents();
        setEvents(nextEvents);
      } catch (error) {
        if (handleAuthError(error)) {
          return;
        }

        if (error instanceof Error && error.message) {
          setEventsErrorMessage(error.message);
        } else {
          setEventsErrorMessage("Unable to load past events.");
        }
      } finally {
        setIsEventsLoading(false);
      }
    };

    void run();
  }, [fetchPastEvents, handleAuthError]);

  useEffect(() => {
    const run = async () => {
      if (!activeEventId) {
        setMatches([]);
        setStandings([]);
        setMvpSummary(null);
        setMatchesErrorMessage(null);
        setStandingsErrorMessage(null);
        setMvpErrorMessage(null);
        setIsDetailsLoading(false);
        return;
      }

      setIsDetailsLoading(true);
      setMatchesErrorMessage(null);
      setStandingsErrorMessage(null);
      setMvpErrorMessage(null);

      try {
        const [matchesResult, standingsResult, mvpResult] = await Promise.allSettled([
          fetchMatches(activeEventId),
          fetchStandings(activeEventId),
          fetchMvpSummary(activeEventId),
        ]);

        for (const result of [matchesResult, standingsResult, mvpResult]) {
          if (result.status === "rejected" && hasAuthCodeError(result.reason)) {
            handleAuthError(result.reason);
            return;
          }
        }

        if (matchesResult.status === "fulfilled") {
          setMatches(matchesResult.value);
        } else {
          setMatches([]);
          if (matchesResult.reason instanceof Error && matchesResult.reason.message) {
            setMatchesErrorMessage(matchesResult.reason.message);
          } else {
            setMatchesErrorMessage("Unable to load event matches.");
          }
        }

        if (standingsResult.status === "fulfilled") {
          setStandings(standingsResult.value);
        } else {
          setStandings([]);
          if (standingsResult.reason instanceof Error && standingsResult.reason.message) {
            setStandingsErrorMessage(standingsResult.reason.message);
          } else {
            setStandingsErrorMessage("Unable to load standings snapshot.");
          }
        }

        if (mvpResult.status === "fulfilled") {
          setMvpSummary(mvpResult.value);
        } else {
          setMvpSummary(null);
          if (mvpResult.reason instanceof Error && mvpResult.reason.message) {
            setMvpErrorMessage(mvpResult.reason.message);
          } else {
            setMvpErrorMessage("Unable to load MVP summary.");
          }
        }
      } finally {
        setIsDetailsLoading(false);
      }
    };

    void run();
  }, [
    activeEventId,
    detailsReloadNonce,
    fetchMatches,
    fetchMvpSummary,
    fetchStandings,
    handleAuthError,
  ]);

  async function copyRegistrationLink(event: EventRecord) {
    const token = event.registrationLinkToken?.trim();
    if (!token) {
      setMetadataMessage({
        tone: "error",
        text: "No registration link token exists for this event.",
      });
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
      setMetadataMessage({
        tone: "success",
        text: "Registration link copied.",
      });
    } catch {
      setMetadataMessage({
        tone: "error",
        text: `Unable to copy link. Share this: ${registrationUrl}`,
      });
    }
  }

  const registrationPath =
    activeEvent?.registrationLinkToken && activeEvent.registrationLinkToken.trim().length > 0
      ? buildRegistrationPath(activeEvent.id, activeEvent.registrationLinkToken)
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Historical Events</h2>
            <p className="text-xs text-zinc-500">
              Archived + completed events ({events.length})
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshPastEvents()}
            disabled={isEventsLoading}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
          >
            {isEventsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Search</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Name, code, slug, or id"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PastEventStatusFilter)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="all">All historical events</option>
            <option value="archived">Archived only</option>
            <option value="completed">Completed only</option>
          </select>
        </label>

        {eventsErrorMessage ? <p className="text-sm text-red-600">{eventsErrorMessage}</p> : null}
        {isEventsLoading ? (
          <p className="text-sm text-zinc-500">Loading past events...</p>
        ) : null}

        {!isEventsLoading && filteredEvents.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            No past events match the current filters.
          </p>
        ) : null}

        <div className="grid max-h-[640px] gap-2 overflow-y-auto pr-1">
          {filteredEvents.map((event) => {
            const isActive = event.id === activeEventId;

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setSelectedEventId(event.id);
                  setMetadataMessage(null);
                  setCopiedLinkFor(null);
                }}
                className={`rounded-lg border p-3 text-left transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{event.name}</p>
                  <p
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${
                      isActive
                        ? "bg-white/20 text-white dark:bg-zinc-800 dark:text-zinc-100"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {formatEventStatus(event.status)}
                  </p>
                </div>
                <p
                  className={`mt-1 text-xs ${isActive ? "text-zinc-200 dark:text-zinc-700" : "text-zinc-500"}`}
                >
                  {event.code} • {formatDateTime(event.endsAt)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="space-y-6">
        {!activeEvent ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Select an event to view historical metadata, standings, match summary, and MVP data.
            </p>
          </section>
        ) : (
          <>
            <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{activeEvent.name}</h2>
                  <p className="text-sm text-zinc-500">
                    Event Code {activeEvent.code} • {formatEventStatus(activeEvent.status)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsReloadNonce((current) => current + 1)}
                  disabled={isDetailsLoading}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
                >
                  {isDetailsLoading ? "Refreshing..." : "Refresh Historical Data"}
                </button>
              </div>

              {metadataMessage ? (
                <p
                  className={`text-sm ${
                    metadataMessage.tone === "error"
                      ? "text-red-600"
                      : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {metadataMessage.text}
                </p>
              ) : null}

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-medium">Event ID:</span>{" "}
                  <span className="font-mono text-xs">{activeEvent.id}</span>
                </p>
                <p>
                  <span className="font-medium">Slug:</span> {activeEvent.slug}
                </p>
                <p>
                  <span className="font-medium">Event Window:</span>{" "}
                  {formatDateTime(activeEvent.startsAt)} → {formatDateTime(activeEvent.endsAt)}
                </p>
                <p>
                  <span className="font-medium">Registration Window:</span>{" "}
                  {formatDateTime(activeEvent.registrationOpensAt)} →{" "}
                  {formatDateTime(activeEvent.registrationClosesAt)}
                </p>
                <p>
                  <span className="font-medium">Created:</span>{" "}
                  {formatDateTime(activeEvent.createdAt)}
                </p>
                <p>
                  <span className="font-medium">Updated:</span>{" "}
                  {formatDateTime(activeEvent.updatedAt)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Registration Link</p>
                <p className="break-all rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950">
                  {registrationPath ?? "No registration link token"}
                </p>
                <button
                  type="button"
                  disabled={!registrationPath}
                  onClick={() => void copyRegistrationLink(activeEvent)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700"
                >
                  {copiedLinkFor === activeEvent.id ? "Copied" : "Copy Registration Link"}
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold">Standings Snapshot</h3>
              {isDetailsLoading ? (
                <p className="text-sm text-zinc-500">Loading standings...</p>
              ) : null}
              {standingsErrorMessage ? (
                <p className="text-sm text-red-600">{standingsErrorMessage}</p>
              ) : null}

              {!isDetailsLoading && !standingsErrorMessage && standings.length === 0 ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  No standings snapshot found for this event.
                </p>
              ) : null}

              {standings.length > 0 ? (
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
                          W
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                          L
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
                          <td className="px-3 py-2">{index + 1}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium">{standing.teamName}</p>
                            <p className="font-mono text-xs text-zinc-500">{standing.teamId}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{standing.wins}</td>
                          <td className="px-3 py-2 text-right">{standing.losses}</td>
                          <td className="px-3 py-2 text-right">{standing.matchesPlayed}</td>
                          <td className="px-3 py-2 text-right">{standing.roundDiff}</td>
                          <td className="px-3 py-2 text-right">{standing.points ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold">Match Result Summary</h3>
              {isDetailsLoading ? (
                <p className="text-sm text-zinc-500">Loading matches...</p>
              ) : null}
              {matchesErrorMessage ? (
                <p className="text-sm text-red-600">{matchesErrorMessage}</p>
              ) : null}

              {!isDetailsLoading && !matchesErrorMessage ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">Total Matches</p>
                    <p className="mt-1 text-xl font-semibold">{matchSummary.totalMatches}</p>
                  </article>
                  <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">Completed</p>
                    <p className="mt-1 text-xl font-semibold">{matchSummary.completedMatches}</p>
                  </article>
                  <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">Forfeits</p>
                    <p className="mt-1 text-xl font-semibold">{matchSummary.forfeitMatches}</p>
                  </article>
                  <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">Cancelled</p>
                    <p className="mt-1 text-xl font-semibold">{matchSummary.cancelledMatches}</p>
                  </article>
                  <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950">
                    <p className="text-xs text-zinc-500">Participating Teams</p>
                    <p className="mt-1 text-xl font-semibold">{matchSummary.teamCount}</p>
                  </article>
                </div>
              ) : null}

              {!isDetailsLoading && !matchesErrorMessage && sortedMatches.length === 0 ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  No matches recorded for this event.
                </p>
              ) : null}

              {sortedMatches.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                    <thead className="bg-zinc-50 dark:bg-zinc-950">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                          Played At
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                          Fixture
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-300">
                          Status
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                          Score
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                          Round Diff
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-600 dark:text-zinc-300">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {sortedMatches.map((match) => (
                        <tr key={match.id}>
                          <td className="px-3 py-2">{formatDateTime(match.playedAt)}</td>
                          <td className="px-3 py-2">
                            <p>
                              {match.homeTeamId} vs {match.awayTeamId}
                            </p>
                            <p className="font-mono text-xs text-zinc-500">{match.id}</p>
                          </td>
                          <td className="px-3 py-2">{formatMatchStatus(match.status)}</td>
                          <td className="px-3 py-2 text-right">
                            {match.homeScore}-{match.awayScore}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {match.homeRoundDiff}/{match.awayRoundDiff}
                          </td>
                          <td className="px-3 py-2 text-right">{getMatchResultLabel(match)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold">MVP Summary</h3>
              {isDetailsLoading ? <p className="text-sm text-zinc-500">Loading MVP...</p> : null}
              {mvpErrorMessage ? <p className="text-sm text-red-600">{mvpErrorMessage}</p> : null}

              {!isDetailsLoading && !mvpErrorMessage && !mvpSummary ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  No MVP summary generated for this event.
                </p>
              ) : null}

              {mvpSummary?.topCandidate ? (
                <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
                  <h4 className="text-base font-semibold">Top MVP Candidate</h4>
                  <p className="mt-2 font-mono text-sm">{mvpSummary.topCandidate.playerId}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Team {mvpSummary.topCandidate.teamId} • Score{" "}
                    {mvpSummary.topCandidate.score.toFixed(3)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Generated: {formatDateTime(mvpSummary.generatedAt)}
                  </p>
                </article>
              ) : null}

              {mvpSummary && mvpSummary.candidates.length > 0 ? (
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
                          <td className="px-3 py-2 text-right">{candidate.points ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{candidate.score.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
