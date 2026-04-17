"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import type {
  EventRecord,
  RandomTeamCreationSummary,
  SoloPlayerAssignmentSummary,
  SoloPlayerPoolRecord,
  UnderfilledTeamRecord,
} from "@/lib/domain/types";

type EventsResponse =
  | { success: true; data: { events: EventRecord[] } }
  | { success: false; error: string };

type SoloPoolResponse =
  | { success: true; data: { soloPlayers: SoloPlayerPoolRecord[] } }
  | { success: false; error: string };

type UnderfilledTeamsResponse =
  | { success: true; data: { teams: UnderfilledTeamRecord[] } }
  | { success: false; error: string };

type RandomizeResponse =
  | { success: true; data: { summary: RandomTeamCreationSummary } }
  | { success: false; error: string };

type AssignResponse =
  | { success: true; data: { summary: SoloPlayerAssignmentSummary } }
  | { success: false; error: string };

type SubmissionMessage =
  | { tone: "success"; text: string }
  | { tone: "error"; text: string };

function resolveEventSelection(events: EventRecord[], selectedEventId: string): string {
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    return selectedEventId;
  }

  return events[0]?.id ?? "";
}

export function TeamBuilderClient() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [soloPlayers, setSoloPlayers] = useState<SoloPlayerPoolRecord[]>([]);
  const [underfilledTeams, setUnderfilledTeams] = useState<UnderfilledTeamRecord[]>([]);
  const [selectedSoloPlayerIds, setSelectedSoloPlayerIds] = useState<string[]>([]);
  const [selectedTargetTeamId, setSelectedTargetTeamId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<SubmissionMessage | null>(null);

  const selectedCount = selectedSoloPlayerIds.length;
  const selectedTeam = useMemo(
    () => underfilledTeams.find((team) => team.id === selectedTargetTeamId) ?? null,
    [selectedTargetTeamId, underfilledTeams],
  );

  const refreshPools = useCallback(
    async (eventId: string) => {
      if (!eventId) {
        setSoloPlayers([]);
        setUnderfilledTeams([]);
        return;
      }

      const [soloResponse, teamResponse] = await Promise.all([
        fetch(`/api/admin/solo-pool?eventId=${encodeURIComponent(eventId)}&limit=200`, {
          method: "GET",
        }),
        fetch(`/api/admin/teams/underfilled?eventId=${encodeURIComponent(eventId)}&limit=100`, {
          method: "GET",
        }),
      ]);

      const soloBody = (await soloResponse.json()) as SoloPoolResponse;
      const teamBody = (await teamResponse.json()) as UnderfilledTeamsResponse;

      if (!soloBody.success) {
        throwAdminGuardError(soloResponse.status, soloBody.error);
        throw new Error(soloBody.error);
      }

      if (!teamBody.success) {
        throwAdminGuardError(teamResponse.status, teamBody.error);
        throw new Error(teamBody.error);
      }

      setSoloPlayers(soloBody.data.soloPlayers);
      setUnderfilledTeams(teamBody.data.teams);
      setSelectedTargetTeamId((current) =>
        teamBody.data.teams.some((team) => team.id === current)
          ? current
          : (teamBody.data.teams[0]?.id ?? ""),
      );
      setSelectedSoloPlayerIds((current) =>
        current.filter((id) => soloBody.data.soloPlayers.some((player) => player.id === id)),
      );
    },
    [],
  );

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        const eventsResponse = await fetch("/api/admin/events?limit=100", { method: "GET" });
        const eventsBody = (await eventsResponse.json()) as EventsResponse;
        if (!eventsBody.success) {
          throwAdminGuardError(eventsResponse.status, eventsBody.error);
          throw new Error(eventsBody.error);
        }

        setEvents(eventsBody.data.events);
        const nextEventId = resolveEventSelection(eventsBody.data.events, "");
        setSelectedEventId(nextEventId);
        await refreshPools(nextEventId);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }

        const fallback = "Unable to load team builder data.";
        setMessage({
          tone: "error",
          text: error instanceof Error && error.message ? error.message : fallback,
        });
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [refreshPools, router]);

  async function handleEventChange(nextEventId: string) {
    setSelectedEventId(nextEventId);
    setMessage(null);
    setIsLoading(true);
    try {
      await refreshPools(nextEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to refresh event pools.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSoloSelection(soloPlayerId: string) {
    setSelectedSoloPlayerIds((current) =>
      current.includes(soloPlayerId)
        ? current.filter((id) => id !== soloPlayerId)
        : [...current, soloPlayerId],
    );
  }

  async function createRandomTeams() {
    if (!selectedEventId) {
      setMessage({ tone: "error", text: "Select an event first." });
      return;
    }

    if (selectedCount < 5 || selectedCount % 5 !== 0) {
      setMessage({
        tone: "error",
        text: "Select a player count divisible by 5 for random team creation.",
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/randomize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          soloPlayerIds: selectedSoloPlayerIds,
        }),
      });
      const body = (await response.json()) as RandomizeResponse;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text: `Created ${body.data.summary.createdTeamCount} teams from ${body.data.summary.selectedCount} selected solo players.`,
      });
      setSelectedSoloPlayerIds([]);
      await refreshPools(selectedEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to create random teams.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function assignToUnderfilledTeam() {
    if (!selectedEventId) {
      setMessage({ tone: "error", text: "Select an event first." });
      return;
    }

    if (!selectedTargetTeamId) {
      setMessage({ tone: "error", text: "Select a target team." });
      return;
    }

    if (selectedCount === 0) {
      setMessage({ tone: "error", text: "Select at least one solo player first." });
      return;
    }

    if (selectedTeam && selectedCount > selectedTeam.slotsRemaining) {
      setMessage({
        tone: "error",
        text: `Selected team has only ${selectedTeam.slotsRemaining} open slots.`,
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/assign-solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: selectedTargetTeamId,
          soloPlayerIds: selectedSoloPlayerIds,
        }),
      });
      const body = (await response.json()) as AssignResponse;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text: `Assigned ${body.data.summary.assignedCount} solo players. Team now has ${body.data.summary.resultingPlayerCount} players.`,
      });
      setSelectedSoloPlayerIds([]);
      await refreshPools(selectedEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to assign solo players.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectionHint =
    selectedCount === 0
      ? "No solo players selected."
      : `${selectedCount} selected${selectedCount % 5 === 0 ? " (valid for random teams)" : " (needs divisible by 5 for random teams)"}.`;

  return (
    <section className="space-y-5">
      <div className="surface-base surface-elevated grid gap-4 p-5 xl:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <label htmlFor="team-builder-event" className="type-caption text-muted">
            Event
          </label>
          <select
            id="team-builder-event"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            value={selectedEventId}
            onChange={(event) => void handleEventChange(event.target.value)}
            disabled={isLoading || isSubmitting}
          >
            {events.length === 0 ? <option value="">No events available</option> : null}
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} ({event.status})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">{selectionHint}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => void createRandomTeams()}
            className="btn-base btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading || isSubmitting || selectedCount === 0}
          >
            Create Teams of 5
          </button>
          <button
            type="button"
            onClick={() => void assignToUnderfilledTeam()}
            className="btn-base btn-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading || isSubmitting || selectedCount === 0}
          >
            Assign to Selected Team
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

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="surface-base surface-elevated p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="type-subtitle">Available Solo Players</h2>
            <p className="text-xs text-muted">{soloPlayers.length} available</p>
          </div>

          {isLoading ? <p className="status-message status-default">Loading solo pool...</p> : null}
          {!isLoading && soloPlayers.length === 0 ? (
            <p className="status-message status-default">
              No available solo players for this event.
            </p>
          ) : null}

          {soloPlayers.length > 0 ? (
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Select</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Riot ID</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {soloPlayers.map((player) => {
                    const selected = selectedSoloPlayerIds.includes(player.id);
                    return (
                      <tr key={player.id} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSoloSelection(player.id)}
                            disabled={isSubmitting}
                          />
                        </td>
                        <td className="px-3 py-2">{player.name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{player.riotId}</td>
                        <td className="px-3 py-2 capitalize">{player.preferredRole}</td>
                        <td className="px-3 py-2 capitalize">{player.currentRank ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className="surface-base surface-elevated space-y-4 p-5">
          <div>
            <h2 className="type-subtitle">Underfilled Teams (&lt; 5 Players)</h2>
            <p className="mt-1 text-xs text-muted">
              Pick a target team to assign selected solo players.
            </p>
          </div>

          <select
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            value={selectedTargetTeamId}
            onChange={(event) => setSelectedTargetTeamId(event.target.value)}
            disabled={isLoading || isSubmitting}
          >
            {underfilledTeams.length === 0 ? <option value="">No underfilled teams</option> : null}
            {underfilledTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.teamName} ({team.playerCount}/5)
              </option>
            ))}
          </select>

          {selectedTeam ? (
            <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p>
                <span className="font-medium">Team:</span> {selectedTeam.teamName}
              </p>
              <p>
                <span className="font-medium">Current:</span> {selectedTeam.playerCount}/5
              </p>
              <p>
                <span className="font-medium">Open Slots:</span> {selectedTeam.slotsRemaining}
              </p>
            </div>
          ) : null}

          <div className="rounded-md border border-zinc-200 p-3 text-sm text-muted dark:border-zinc-800">
            <p>
              <span className="font-medium text-soft">Selected players:</span> {selectedCount}
            </p>
            <p className="mt-1">
              Random team creation needs selection count divisible by 5.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
