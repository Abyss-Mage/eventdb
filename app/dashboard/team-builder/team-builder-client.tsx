"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import type {
  ApprovedTeamRosterRecord,
  EventRecord,
  PlayerRank,
  PlayerRole,
  RandomTeamCreationSummary,
  SoloPlayerAssignmentSummary,
  SoloPlayerPoolRecord,
  UnderfilledTeamRecord,
} from "@/lib/domain/types";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type SubmissionMessage =
  | { tone: "success"; text: string }
  | { tone: "error"; text: string };

type TeamFormState = {
  teamName: string;
  captainDiscordId: string;
  teamTag: string;
  teamLogoUrl: string;
};

type TeamPlayerFormState = {
  name: string;
  riotId: string;
  discordId: string;
  role: PlayerRole;
};

type FreeAgentFormState = {
  name: string;
  riotId: string;
  discordId: string;
  preferredRole: PlayerRole;
  email: string;
  currentRank: PlayerRank | "";
  peakRank: PlayerRank | "";
};

const EMPTY_TEAM_FORM: TeamFormState = {
  teamName: "",
  captainDiscordId: "",
  teamTag: "",
  teamLogoUrl: "",
};

const EMPTY_PLAYER_FORM: TeamPlayerFormState = {
  name: "",
  riotId: "",
  discordId: "",
  role: "flex",
};

const EMPTY_FREE_AGENT_FORM: FreeAgentFormState = {
  name: "",
  riotId: "",
  discordId: "",
  preferredRole: "flex",
  email: "",
  currentRank: "",
  peakRank: "",
};

const ROLE_OPTIONS: Array<{ value: PlayerRole; label: string }> = [
  { value: "duelist", label: "Duelist" },
  { value: "controller", label: "Controller" },
  { value: "initiator", label: "Initiator" },
  { value: "sentinel", label: "Sentinel" },
  { value: "flex", label: "Flex" },
];

const RANK_OPTIONS: Array<{ value: PlayerRank; label: string }> = [
  { value: "iron", label: "Iron" },
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
  { value: "diamond", label: "Diamond" },
  { value: "ascendant", label: "Ascendant" },
  { value: "immortal", label: "Immortal" },
  { value: "radiant", label: "Radiant" },
];

function resolveEventSelection(events: EventRecord[], selectedEventId: string): string {
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    return selectedEventId;
  }

  return events[0]?.id ?? "";
}

function normalizedOptional(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function TeamBuilderClient() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [soloPlayers, setSoloPlayers] = useState<SoloPlayerPoolRecord[]>([]);
  const [underfilledTeams, setUnderfilledTeams] = useState<UnderfilledTeamRecord[]>([]);
  const [rosterTeams, setRosterTeams] = useState<ApprovedTeamRosterRecord[]>([]);
  const [selectedSoloPlayerIds, setSelectedSoloPlayerIds] = useState<string[]>([]);
  const [selectedTargetTeamId, setSelectedTargetTeamId] = useState("");
  const [selectedRosterTeamId, setSelectedRosterTeamId] = useState("");
  const [selectedRosterPlayerId, setSelectedRosterPlayerId] = useState("");
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState("");
  const [moveDestinationType, setMoveDestinationType] = useState<"team" | "free_agent">(
    "free_agent",
  );
  const [moveDestinationTeamId, setMoveDestinationTeamId] = useState("");
  const [teamForm, setTeamForm] = useState<TeamFormState>(EMPTY_TEAM_FORM);
  const [addPlayerForm, setAddPlayerForm] = useState<TeamPlayerFormState>(EMPTY_PLAYER_FORM);
  const [rosterPlayerForm, setRosterPlayerForm] =
    useState<TeamPlayerFormState>(EMPTY_PLAYER_FORM);
  const [freeAgentForm, setFreeAgentForm] = useState<FreeAgentFormState>(
    EMPTY_FREE_AGENT_FORM,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<SubmissionMessage | null>(null);
  const selectedTargetTeamIdRef = useRef(selectedTargetTeamId);
  const selectedRosterTeamIdRef = useRef(selectedRosterTeamId);
  const selectedRosterPlayerIdRef = useRef(selectedRosterPlayerId);
  const selectedFreeAgentIdRef = useRef(selectedFreeAgentId);

  const selectedCount = selectedSoloPlayerIds.length;

  const selectedTeam = useMemo(
    () => underfilledTeams.find((team) => team.id === selectedTargetTeamId) ?? null,
    [selectedTargetTeamId, underfilledTeams],
  );

  const selectedRosterTeam = useMemo(
    () => rosterTeams.find((team) => team.id === selectedRosterTeamId) ?? null,
    [rosterTeams, selectedRosterTeamId],
  );

  const selectedRosterPlayer = useMemo(
    () =>
      selectedRosterTeam?.players.find((player) => player.id === selectedRosterPlayerId) ??
      null,
    [selectedRosterPlayerId, selectedRosterTeam],
  );

  const selectedFreeAgent = useMemo(
    () => soloPlayers.find((player) => player.id === selectedFreeAgentId) ?? null,
    [selectedFreeAgentId, soloPlayers],
  );

  const destinationTeams = useMemo(
    () =>
      rosterTeams.filter(
        (team) => team.id !== selectedRosterTeamId && team.playerCount < 5,
      ),
    [rosterTeams, selectedRosterTeamId],
  );

  const applyRosterPlayerSelection = useCallback(
    (playerId: string, team: ApprovedTeamRosterRecord | null) => {
      setSelectedRosterPlayerId(playerId);

      if (!team) {
        setRosterPlayerForm(EMPTY_PLAYER_FORM);
        return;
      }

      const player = team.players.find((candidate) => candidate.id === playerId);
      if (!player) {
        setRosterPlayerForm(EMPTY_PLAYER_FORM);
        return;
      }

      setRosterPlayerForm({
        name: player.name,
        riotId: player.riotId,
        discordId: player.discordId,
        role: player.role,
      });
    },
    [],
  );

  const applyRosterTeamSelection = useCallback(
    (teamId: string, teams: ApprovedTeamRosterRecord[]) => {
      setSelectedRosterTeamId(teamId);

      const team = teams.find((candidate) => candidate.id === teamId) ?? null;
      if (!team) {
        setTeamForm(EMPTY_TEAM_FORM);
        applyRosterPlayerSelection("", null);
        setMoveDestinationTeamId("");
        return;
      }

      setTeamForm({
        teamName: team.teamName,
        captainDiscordId: team.captainDiscordId,
        teamTag: team.teamTag ?? "",
        teamLogoUrl: team.teamLogoUrl ?? "",
      });

      const nextPlayerId = team.players.some(
        (player) => player.id === selectedRosterPlayerIdRef.current,
      )
        ? selectedRosterPlayerIdRef.current
        : (team.players[0]?.id ?? "");
      applyRosterPlayerSelection(nextPlayerId, team);

      const availableDestinations = teams.filter(
        (candidate) => candidate.id !== teamId && candidate.playerCount < 5,
      );
      setMoveDestinationTeamId((current) =>
        availableDestinations.some((candidate) => candidate.id === current)
          ? current
          : (availableDestinations[0]?.id ?? ""),
      );
    },
    [applyRosterPlayerSelection],
  );

  const applyFreeAgentSelection = useCallback(
    (freeAgentId: string, players: SoloPlayerPoolRecord[]) => {
      setSelectedFreeAgentId(freeAgentId);

      const freeAgent = players.find((candidate) => candidate.id === freeAgentId);
      if (!freeAgent) {
        setFreeAgentForm(EMPTY_FREE_AGENT_FORM);
        return;
      }

      setFreeAgentForm({
        name: freeAgent.name,
        riotId: freeAgent.riotId,
        discordId: freeAgent.discordId,
        preferredRole: freeAgent.preferredRole,
        email: freeAgent.email ?? "",
        currentRank: freeAgent.currentRank ?? "",
        peakRank: freeAgent.peakRank ?? "",
      });
    },
    [],
  );

  const refreshPools = useCallback(async (eventId: string) => {
    if (!eventId) {
      setSoloPlayers([]);
      setUnderfilledTeams([]);
      setRosterTeams([]);
      setSelectedTargetTeamId("");
      applyRosterTeamSelection("", []);
      applyFreeAgentSelection("", []);
      return;
    }

    const [soloResponse, underfilledResponse, rosterResponse] = await Promise.all([
      fetch(`/api/admin/solo-pool?eventId=${encodeURIComponent(eventId)}&limit=200`, {
        method: "GET",
      }),
      fetch(`/api/admin/teams/underfilled?eventId=${encodeURIComponent(eventId)}&limit=100`, {
        method: "GET",
      }),
      fetch(`/api/admin/teams/roster?eventId=${encodeURIComponent(eventId)}&limit=200`, {
        method: "GET",
      }),
    ]);

    const soloBody = (await soloResponse.json()) as ApiResponse<{
      soloPlayers: SoloPlayerPoolRecord[];
    }>;
    const underfilledBody = (await underfilledResponse.json()) as ApiResponse<{
      teams: UnderfilledTeamRecord[];
    }>;
    const rosterBody = (await rosterResponse.json()) as ApiResponse<{
      teams: ApprovedTeamRosterRecord[];
    }>;

    if (!soloBody.success) {
      throwAdminGuardError(soloResponse.status, soloBody.error);
      throw new Error(soloBody.error);
    }

    if (!underfilledBody.success) {
      throwAdminGuardError(underfilledResponse.status, underfilledBody.error);
      throw new Error(underfilledBody.error);
    }

    if (!rosterBody.success) {
      throwAdminGuardError(rosterResponse.status, rosterBody.error);
      throw new Error(rosterBody.error);
    }

    setSoloPlayers(soloBody.data.soloPlayers);
    setUnderfilledTeams(underfilledBody.data.teams);
    setRosterTeams(rosterBody.data.teams);
    const nextTargetTeamId = underfilledBody.data.teams.some(
      (team) => team.id === selectedTargetTeamIdRef.current,
    )
      ? selectedTargetTeamIdRef.current
      : (underfilledBody.data.teams[0]?.id ?? "");
    setSelectedTargetTeamId(nextTargetTeamId);

    const nextRosterTeamId = rosterBody.data.teams.some(
      (team) => team.id === selectedRosterTeamIdRef.current,
    )
      ? selectedRosterTeamIdRef.current
      : (rosterBody.data.teams[0]?.id ?? "");
    applyRosterTeamSelection(nextRosterTeamId, rosterBody.data.teams);

    setSelectedSoloPlayerIds((current) =>
      current.filter((id) => soloBody.data.soloPlayers.some((player) => player.id === id)),
    );
    const nextFreeAgentId = soloBody.data.soloPlayers.some(
      (player) => player.id === selectedFreeAgentIdRef.current,
    )
      ? selectedFreeAgentIdRef.current
      : (soloBody.data.soloPlayers[0]?.id ?? "");
    applyFreeAgentSelection(nextFreeAgentId, soloBody.data.soloPlayers);
  }, [applyFreeAgentSelection, applyRosterTeamSelection]);

  useEffect(() => {
    selectedTargetTeamIdRef.current = selectedTargetTeamId;
    selectedRosterTeamIdRef.current = selectedRosterTeamId;
    selectedRosterPlayerIdRef.current = selectedRosterPlayerId;
    selectedFreeAgentIdRef.current = selectedFreeAgentId;
  }, [
    selectedFreeAgentId,
    selectedRosterPlayerId,
    selectedRosterTeamId,
    selectedTargetTeamId,
  ]);

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        const eventsResponse = await fetch("/api/admin/events?limit=100", { method: "GET" });
        const eventsBody = (await eventsResponse.json()) as ApiResponse<{
          events: EventRecord[];
        }>;
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

        setMessage({
          tone: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load team builder data.",
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
      const body = (await response.json()) as ApiResponse<{
        summary: RandomTeamCreationSummary;
      }>;
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
      const body = (await response.json()) as ApiResponse<{
        summary: SoloPlayerAssignmentSummary;
      }>;
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

  async function saveTeamDetails() {
    if (!selectedEventId || !selectedRosterTeamId) {
      setMessage({ tone: "error", text: "Select a team first." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: selectedRosterTeamId,
          teamName: teamForm.teamName.trim(),
          captainDiscordId: teamForm.captainDiscordId.trim(),
          teamTag: normalizedOptional(teamForm.teamTag),
          teamLogoUrl: normalizedOptional(teamForm.teamLogoUrl),
        }),
      });
      const body = (await response.json()) as ApiResponse<{ team: { id: string } }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({ tone: "success", text: "Team details updated." });
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
            : "Unable to update team details.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function addPlayerToSelectedTeam() {
    if (!selectedEventId || !selectedRosterTeamId) {
      setMessage({ tone: "error", text: "Select a team first." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/player/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: selectedRosterTeamId,
          player: {
            name: addPlayerForm.name.trim(),
            riotId: addPlayerForm.riotId.trim(),
            discordId: addPlayerForm.discordId.trim(),
            role: addPlayerForm.role,
          },
        }),
      });
      const body = (await response.json()) as ApiResponse<{
        summary: { resultingPlayerCount: number };
      }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text: `Player added. Team now has ${body.data.summary.resultingPlayerCount} players.`,
      });
      setAddPlayerForm(EMPTY_PLAYER_FORM);
      await refreshPools(selectedEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message ? error.message : "Unable to add player.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateSelectedRosterPlayer() {
    if (!selectedEventId || !selectedRosterTeamId || !selectedRosterPlayerId) {
      setMessage({ tone: "error", text: "Select a roster player first." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/player/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: selectedRosterTeamId,
          playerId: selectedRosterPlayerId,
          name: rosterPlayerForm.name.trim(),
          riotId: rosterPlayerForm.riotId.trim(),
          discordId: rosterPlayerForm.discordId.trim(),
          role: rosterPlayerForm.role,
        }),
      });
      const body = (await response.json()) as ApiResponse<{ player: { id: string } }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({ tone: "success", text: "Roster player updated." });
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
            : "Unable to update roster player.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function moveSelectedRosterPlayer() {
    if (!selectedEventId || !selectedRosterPlayerId) {
      setMessage({ tone: "error", text: "Select a roster player first." });
      return;
    }

    if (moveDestinationType === "team" && !moveDestinationTeamId) {
      setMessage({ tone: "error", text: "Select a destination team." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/player/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          playerId: selectedRosterPlayerId,
          destinationType: moveDestinationType,
          destinationTeamId:
            moveDestinationType === "team" ? moveDestinationTeamId : undefined,
        }),
      });
      const body = (await response.json()) as ApiResponse<{
        summary: { toTeamId?: string; toFreeAgentId?: string };
      }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text:
          moveDestinationType === "team"
            ? `Player moved to team ${body.data.summary.toTeamId ?? moveDestinationTeamId}.`
            : `Player moved to free-agent pool (${body.data.summary.toFreeAgentId ?? "updated"}).`,
      });
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
            : "Unable to move roster player.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeSelectedRosterPlayer() {
    if (!selectedEventId || !selectedRosterTeamId || !selectedRosterPlayerId) {
      setMessage({ tone: "error", text: "Select a roster player first." });
      return;
    }

    if (!window.confirm("Remove this player from the team roster?")) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/teams/player/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          teamId: selectedRosterTeamId,
          playerId: selectedRosterPlayerId,
        }),
      });
      const body = (await response.json()) as ApiResponse<{
        summary: { resultingPlayerCount: number };
      }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text: `Player removed. Team now has ${body.data.summary.resultingPlayerCount} players.`,
      });
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
            : "Unable to remove roster player.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateSelectedFreeAgent() {
    if (!selectedEventId || !selectedFreeAgentId) {
      setMessage({ tone: "error", text: "Select a free agent first." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/solo-pool/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          freeAgentId: selectedFreeAgentId,
          name: freeAgentForm.name.trim(),
          riotId: freeAgentForm.riotId.trim(),
          discordId: freeAgentForm.discordId.trim(),
          preferredRole: freeAgentForm.preferredRole,
          email: normalizedOptional(freeAgentForm.email),
          currentRank: freeAgentForm.currentRank || undefined,
          peakRank: freeAgentForm.peakRank || undefined,
        }),
      });
      const body = (await response.json()) as ApiResponse<{ soloPlayer: { id: string } }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({ tone: "success", text: "Free-agent profile updated." });
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
            : "Unable to update free-agent profile.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeSelectedFreeAgent() {
    if (!selectedEventId || !selectedFreeAgentId) {
      setMessage({ tone: "error", text: "Select a free agent first." });
      return;
    }

    if (!window.confirm("Remove this free agent from the event pool?")) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/solo-pool/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          freeAgentId: selectedFreeAgentId,
        }),
      });
      const body = (await response.json()) as ApiResponse<{
        summary: { freeAgentId: string };
      }>;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setMessage({
        tone: "success",
        text: `Removed free agent ${body.data.summary.freeAgentId}.`,
      });
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
            : "Unable to remove free agent.",
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
        </article>
      </div>

      <article className="surface-base surface-elevated space-y-5 p-5">
        <div>
          <h2 className="type-subtitle">Roster Management</h2>
          <p className="mt-1 text-xs text-muted">
            Edit teams, manage roster players, and maintain available free-agent profiles.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="font-medium">Team Details</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Team</span>
              <select
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                value={selectedRosterTeamId}
                onChange={(event) =>
                  applyRosterTeamSelection(event.target.value, rosterTeams)
                }
                disabled={isLoading || isSubmitting}
              >
                {rosterTeams.length === 0 ? <option value="">No approved teams</option> : null}
                {rosterTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.teamName} ({team.playerCount}/5)
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Team Name</span>
              <input
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                value={teamForm.teamName}
                onChange={(event) =>
                  setTeamForm((current) => ({ ...current, teamName: event.target.value }))
                }
                disabled={isLoading || isSubmitting || !selectedRosterTeam}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Captain Discord ID</span>
              <input
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                value={teamForm.captainDiscordId}
                onChange={(event) =>
                  setTeamForm((current) => ({
                    ...current,
                    captainDiscordId: event.target.value,
                  }))
                }
                disabled={isLoading || isSubmitting || !selectedRosterTeam}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Team Tag</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={teamForm.teamTag}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, teamTag: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Logo URL</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={teamForm.teamLogoUrl}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, teamLogoUrl: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-base btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => void saveTeamDetails()}
              disabled={isLoading || isSubmitting || !selectedRosterTeam}
            >
              Save Team Details
            </button>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="font-medium">Add Player to Selected Team</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Name</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={addPlayerForm.name}
                  onChange={(event) =>
                    setAddPlayerForm((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Riot ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={addPlayerForm.riotId}
                  onChange={(event) =>
                    setAddPlayerForm((current) => ({ ...current, riotId: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Discord ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={addPlayerForm.discordId}
                  onChange={(event) =>
                    setAddPlayerForm((current) => ({
                      ...current,
                      discordId: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Role</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={addPlayerForm.role}
                  onChange={(event) =>
                    setAddPlayerForm((current) => ({
                      ...current,
                      role: event.target.value as PlayerRole,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterTeam}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn-base btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => void addPlayerToSelectedTeam()}
              disabled={isLoading || isSubmitting || !selectedRosterTeam}
            >
              Add Player
            </button>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="font-medium">Roster Player Actions</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Player</span>
              <select
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                value={selectedRosterPlayerId}
                onChange={(event) =>
                  applyRosterPlayerSelection(event.target.value, selectedRosterTeam)
                }
                disabled={isLoading || isSubmitting || !selectedRosterTeam}
              >
                {!selectedRosterTeam || selectedRosterTeam.players.length === 0 ? (
                  <option value="">No players in selected team</option>
                ) : null}
                {selectedRosterTeam?.players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.riotId})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Name</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={rosterPlayerForm.name}
                  onChange={(event) =>
                    setRosterPlayerForm((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Riot ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={rosterPlayerForm.riotId}
                  onChange={(event) =>
                    setRosterPlayerForm((current) => ({
                      ...current,
                      riotId: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Discord ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={rosterPlayerForm.discordId}
                  onChange={(event) =>
                    setRosterPlayerForm((current) => ({
                      ...current,
                      discordId: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Role</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={rosterPlayerForm.role}
                  onChange={(event) =>
                    setRosterPlayerForm((current) => ({
                      ...current,
                      role: event.target.value as PlayerRole,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Move Destination</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={moveDestinationType}
                  onChange={(event) =>
                    setMoveDestinationType(event.target.value as "team" | "free_agent")
                  }
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                >
                  <option value="free_agent">Free-Agent Pool</option>
                  <option value="team">Another Team</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Destination Team</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={moveDestinationTeamId}
                  onChange={(event) => setMoveDestinationTeamId(event.target.value)}
                  disabled={
                    isLoading ||
                    isSubmitting ||
                    !selectedRosterPlayer ||
                    moveDestinationType !== "team"
                  }
                >
                  {destinationTeams.length === 0 ? (
                    <option value="">No destination teams with open slots</option>
                  ) : null}
                  {destinationTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.teamName} ({team.playerCount}/5)
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-base btn-secondary w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={() => void moveSelectedRosterPlayer()}
                  disabled={isLoading || isSubmitting || !selectedRosterPlayer}
                >
                  Move
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-base btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void updateSelectedRosterPlayer()}
                disabled={isLoading || isSubmitting || !selectedRosterPlayer}
              >
                Save Player
              </button>
              <button
                type="button"
                className="btn-base btn-ghost px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void removeSelectedRosterPlayer()}
                disabled={isLoading || isSubmitting || !selectedRosterPlayer}
              >
                Remove Player
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="font-medium">Free-Agent Profile Actions</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Free Agent</span>
              <select
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                value={selectedFreeAgentId}
                onChange={(event) =>
                  applyFreeAgentSelection(event.target.value, soloPlayers)
                }
                disabled={isLoading || isSubmitting}
              >
                {soloPlayers.length === 0 ? <option value="">No available free agents</option> : null}
                {soloPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} ({player.riotId})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Name</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.name}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Riot ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.riotId}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({ ...current, riotId: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Discord ID</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.discordId}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({
                      ...current,
                      discordId: event.target.value,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Role</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.preferredRole}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({
                      ...current,
                      preferredRole: event.target.value as PlayerRole,
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Email</span>
                <input
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.email}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({ ...current, email: event.target.value }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Current Rank</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.currentRank}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({
                      ...current,
                      currentRank: event.target.value as PlayerRank | "",
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                >
                  <option value="">Not set</option>
                  {RANK_OPTIONS.map((rank) => (
                    <option key={rank.value} value={rank.value}>
                      {rank.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Peak Rank</span>
                <select
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  value={freeAgentForm.peakRank}
                  onChange={(event) =>
                    setFreeAgentForm((current) => ({
                      ...current,
                      peakRank: event.target.value as PlayerRank | "",
                    }))
                  }
                  disabled={isLoading || isSubmitting || !selectedFreeAgent}
                >
                  <option value="">Not set</option>
                  {RANK_OPTIONS.map((rank) => (
                    <option key={rank.value} value={rank.value}>
                      {rank.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-base btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void updateSelectedFreeAgent()}
                disabled={isLoading || isSubmitting || !selectedFreeAgent}
              >
                Save Free-Agent
              </button>
              <button
                type="button"
                className="btn-base btn-ghost px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void removeSelectedFreeAgent()}
                disabled={isLoading || isSubmitting || !selectedFreeAgent}
              >
                Remove Free-Agent
              </button>
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}
