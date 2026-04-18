"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import { formatEventStatus } from "@/app/dashboard/events/event-management-utils";
import type { ApprovedTeamRosterRecord, EventRecord } from "@/lib/domain/types";

type EventsResponse =
  | { success: true; data: { events: EventRecord[] } }
  | { success: false; error: string };

type TeamsRosterResponse =
  | { success: true; data: { teams: ApprovedTeamRosterRecord[] } }
  | { success: false; error: string };

type RegenerateInviteResponse =
  | { success: true; data: { invite: { eventId: string; teamId: string; inviteCode: string } } }
  | { success: false; error: string };

type InlineMessage =
  | { tone: "error"; text: string }
  | { tone: "success"; text: string };

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

export function TeamsRosterClient() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [teams, setTeams] = useState<ApprovedTeamRosterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [regeneratingTeamId, setRegeneratingTeamId] = useState<string | null>(null);
  const [message, setMessage] = useState<InlineMessage | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const totalPlayers = useMemo(
    () => teams.reduce((sum, team) => sum + team.players.length, 0),
    [teams],
  );

  const fetchRosters = useCallback(async (eventId: string) => {
    if (!eventId) {
      setTeams([]);
      return;
    }

    const response = await fetch(
      `/api/admin/teams/roster?eventId=${encodeURIComponent(eventId)}&limit=200`,
      { method: "GET" },
    );
    const body = (await response.json()) as TeamsRosterResponse;
    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    setTeams(body.data.teams);
  }, []);

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setMessage(null);
      setCopiedKey(null);

      try {
        const response = await fetch("/api/admin/events?limit=100", { method: "GET" });
        const body = (await response.json()) as EventsResponse;
        if (!body.success) {
          throwAdminGuardError(response.status, body.error);
          throw new Error(body.error);
        }

        setEvents(body.data.events);
        const nextEventId = resolveSelectedEventId(body.data.events, "");
        setSelectedEventId(nextEventId);
        await fetchRosters(nextEventId);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        setMessage({
          tone: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load team roster data.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [fetchRosters, router]);

  async function handleEventChange(nextEventId: string) {
    setSelectedEventId(nextEventId);
    setCopiedKey(null);
    setMessage(null);
    setIsRefreshing(true);

    try {
      await fetchRosters(nextEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to load approved teams for this event.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRefresh() {
    if (!selectedEventId) {
      return;
    }

    setCopiedKey(null);
    setMessage(null);
    setIsRefreshing(true);

    try {
      await fetchRosters(selectedEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to refresh approved team rosters.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCopy(value: string, key: string) {
    if (!value.trim()) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }

      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setMessage({ tone: "success", text: "Copied to clipboard." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to copy to clipboard.",
      });
    }
  }

  async function handleRegenerateInvite(teamId: string) {
    if (!selectedEventId) {
      return;
    }

    setMessage(null);
    setRegeneratingTeamId(teamId);

    try {
      const response = await fetch("/api/admin/teams/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId,
        }),
      });
      const body = (await response.json()) as RegenerateInviteResponse;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setTeams((current) =>
        current.map((team) =>
          team.id === teamId ? { ...team, inviteCode: body.data.invite.inviteCode } : team,
        ),
      );
      setMessage({ tone: "success", text: `Invite code regenerated for ${teamId}.` });
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to regenerate invite code.",
      });
    } finally {
      setRegeneratingTeamId((current) => (current === teamId ? null : current));
    }
  }

  return (
    <section className="space-y-5">
      <div className="surface-base surface-elevated grid gap-4 p-5 xl:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <label htmlFor="teams-roster-event" className="type-caption text-muted">
            Event
          </label>
          <select
            id="teams-roster-event"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            value={selectedEventId}
            onChange={(event) => void handleEventChange(event.target.value)}
            disabled={isLoading || isRefreshing}
          >
            {events.length === 0 ? <option value="">No events available</option> : null}
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} ({formatEventStatus(event.status)})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {activeEvent
              ? `Showing approved rosters for ${activeEvent.name}.`
              : "Select an event to load approved team rosters."}
          </p>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="btn-base btn-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!selectedEventId || isLoading || isRefreshing}
          >
            Refresh
          </button>
        </div>
      </div>

      {message ? (
        <p
          className={
            message.tone === "success"
              ? "status-message status-success"
              : "status-message status-danger"
          }
        >
          {message.text}
        </p>
      ) : null}

      {!isLoading ? (
        <div className="surface-base surface-subtle grid gap-3 p-4 text-sm sm:grid-cols-3">
          <p>
            <span className="font-medium text-soft">Approved Teams:</span> {teams.length}
          </p>
          <p>
            <span className="font-medium text-soft">Players Listed:</span> {totalPlayers}
          </p>
          <p>
            <span className="font-medium text-soft">Event ID:</span> {selectedEventId || "—"}
          </p>
        </div>
      ) : null}

      {isLoading ? <p className="status-message status-default">Loading team rosters...</p> : null}

      {!isLoading && teams.length === 0 ? (
        <article className="surface-base surface-elevated p-5">
          <p className="status-message status-default">
            No approved teams were found for this event.
          </p>
        </article>
      ) : null}

      <div className="space-y-5">
        {teams.map((team) => (
          <article key={team.id} className="surface-base surface-elevated space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="type-subtitle">{team.teamName}</h2>
                <p className="mt-1 text-xs text-muted">
                  {team.players.length} players listed • Status: {team.status ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(team.id, `team:${team.id}`)}
                className="btn-base btn-secondary px-3 py-1.5 text-xs"
              >
                {copiedKey === `team:${team.id}` ? "Copied Team ID" : "Copy Team ID"}
              </button>
              <button
                type="button"
                onClick={() => void handleRegenerateInvite(team.id)}
                className="btn-base btn-secondary px-3 py-1.5 text-xs"
                disabled={regeneratingTeamId === team.id || isRefreshing}
              >
                {regeneratingTeamId === team.id ? "Regenerating..." : "Regenerate Invite"}
              </button>
            </div>

            <div className="grid gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800 sm:grid-cols-2 xl:grid-cols-3">
              <p>
                <span className="font-medium text-soft">Team ID:</span> {team.id}
              </p>
              <p>
                <span className="font-medium text-soft">Captain Discord:</span>{" "}
                {team.captainDiscordId}
              </p>
              <p>
                <span className="font-medium text-soft">Registration ID:</span>{" "}
                {team.registrationId ?? "—"}
              </p>
              <p>
                <span className="font-medium text-soft">Player Count:</span> {team.playerCount}
              </p>
              <p>
                <span className="font-medium text-soft">Team Tag:</span> {team.teamTag ?? "—"}
              </p>
              <p>
                <span className="font-medium text-soft">Email:</span> {team.email ?? "—"}
              </p>
              <p>
                <span className="font-medium text-soft">Team Logo URL:</span>{" "}
                {team.teamLogoUrl ?? "—"}
              </p>
              <p>
                <span className="font-medium text-soft">Invite Code:</span>{" "}
                <span className="font-mono text-xs">{team.inviteCode ?? "—"}</span>
              </p>
              <p>
                <button
                  type="button"
                  onClick={() => void handleCopy(team.inviteCode ?? "", `invite:${team.id}`)}
                  className="btn-base btn-secondary px-2 py-1 text-[11px]"
                  disabled={!team.inviteCode}
                >
                  {copiedKey === `invite:${team.id}` ? "Copied Invite" : "Copy Invite"}
                </button>
              </p>
              <p>
                <span className="font-medium text-soft">Created:</span>{" "}
                {formatDateTime(team.createdAt)}
              </p>
              <p>
                <span className="font-medium text-soft">Updated:</span>{" "}
                {formatDateTime(team.updatedAt)}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[72rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Player ID</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Riot ID</th>
                    <th className="px-3 py-2 text-left">Discord ID</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-left">Team ID</th>
                    <th className="px-3 py-2 text-left">Event ID</th>
                    <th className="px-3 py-2 text-left">Registration ID</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-3 py-4 text-center text-sm text-muted"
                      >
                        No players found for this team.
                      </td>
                    </tr>
                  ) : null}
                  {team.players.map((player) => (
                    <tr key={player.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{player.id}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopy(player.id, `player:${player.id}`)}
                            className="btn-base btn-secondary px-2 py-1 text-[11px]"
                          >
                            {copiedKey === `player:${player.id}` ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">{player.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{player.riotId}</td>
                      <td className="px-3 py-2">{player.discordId}</td>
                      <td className="px-3 py-2 capitalize">{player.role}</td>
                      <td className="px-3 py-2 font-mono text-xs">{player.teamId}</td>
                      <td className="px-3 py-2 font-mono text-xs">{player.eventId}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {player.registrationId ?? "—"}
                      </td>
                      <td className="px-3 py-2">{formatDateTime(player.createdAt)}</td>
                      <td className="px-3 py-2">{formatDateTime(player.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
