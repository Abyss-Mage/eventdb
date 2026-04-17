"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  soloRegistrationSchema,
  teamRegistrationSchema,
} from "@/lib/domain/schemas";
import type {
  PlayerRank,
  PlayerRole,
  SoloRegistrationInput,
  TeamPlayerInput,
  TeamRegistrationInput,
} from "@/lib/domain/types";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type SubmissionMessage = {
  tone: "success" | "error";
  text: string;
};

type RegistrationMode = "chooser" | "team" | "solo";
type TeamPlayerForm = TeamPlayerInput;

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

function createEmptyPlayer(): TeamPlayerForm {
  return {
    name: "",
    riotId: "",
    discordId: "",
    role: "flex",
  };
}

function normalizedOptional(value: string): string | undefined {
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function formatValidationIssues(issues: { message: string }[]) {
  return Array.from(new Set(issues.map((issue) => issue.message)));
}

export function RegisterForms() {
  const searchParams = useSearchParams();
  const eventId = (searchParams.get("eventId") ?? "").trim();

  const [mode, setMode] = useState<RegistrationMode>("chooser");

  const [teamName, setTeamName] = useState("");
  const [captainDiscordId, setCaptainDiscordId] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [players, setPlayers] = useState<TeamPlayerForm[]>(
    Array.from({ length: 2 }, createEmptyPlayer),
  );
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamMessage, setTeamMessage] = useState<SubmissionMessage | null>(null);

  const [soloPlayer, setSoloPlayer] = useState<SoloRegistrationInput>({
    name: "",
    riotId: "",
    discordId: "",
    preferredRole: "flex",
    eventId: "",
  });
  const [soloEmail, setSoloEmail] = useState("");
  const [soloSubmitting, setSoloSubmitting] = useState(false);
  const [soloMessage, setSoloMessage] = useState<SubmissionMessage | null>(null);

  const canAddPlayer = players.length < 6;
  const canRemovePlayer = players.length > 2;

  const teamPayloadCandidate = useMemo(
    (): TeamRegistrationInput => ({
      teamName: teamName.trim(),
      captainDiscordId: captainDiscordId.trim(),
      players: players.map((player) => ({
        name: player.name.trim(),
        riotId: player.riotId.trim(),
        discordId: player.discordId.trim(),
        role: player.role,
      })),
      eventId,
      email: normalizedOptional(teamEmail),
      teamLogoUrl: normalizedOptional(teamLogoUrl),
      teamTag: normalizedOptional(teamTag),
    }),
    [captainDiscordId, eventId, players, teamEmail, teamLogoUrl, teamName, teamTag],
  );
  const teamValidation = useMemo(
    () => teamRegistrationSchema.safeParse(teamPayloadCandidate),
    [teamPayloadCandidate],
  );
  const teamValidationMessages = useMemo(
    () =>
      teamValidation.success
        ? []
        : formatValidationIssues(teamValidation.error.issues),
    [teamValidation],
  );

  const soloPayloadCandidate = useMemo(
    (): SoloRegistrationInput => ({
      name: soloPlayer.name.trim(),
      riotId: soloPlayer.riotId.trim(),
      discordId: soloPlayer.discordId.trim(),
      preferredRole: soloPlayer.preferredRole,
      eventId,
      email: normalizedOptional(soloEmail),
      currentRank: soloPlayer.currentRank,
      peakRank: soloPlayer.peakRank,
    }),
    [eventId, soloEmail, soloPlayer],
  );
  const soloValidation = useMemo(
    () => soloRegistrationSchema.safeParse(soloPayloadCandidate),
    [soloPayloadCandidate],
  );
  const soloValidationMessages = useMemo(
    () =>
      soloValidation.success
        ? []
        : formatValidationIssues(soloValidation.error.issues),
    [soloValidation],
  );

  const teamButtonText = teamSubmitting
    ? "Submitting team..."
    : "Submit Team Registration";
  const soloButtonText = soloSubmitting
    ? "Submitting player..."
    : "Submit Solo Registration";

  function updatePlayer(
    index: number,
    field: keyof TeamPlayerForm,
    value: string,
  ) {
    setPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index
          ? {
              ...player,
              [field]: field === "role" ? (value as PlayerRole) : value,
            }
          : player,
      ),
    );
  }

  function addPlayerSlot() {
    if (!canAddPlayer) {
      return;
    }
    setPlayers((current) => [...current, createEmptyPlayer()]);
  }

  function removePlayerSlot(index: number) {
    if (!canRemovePlayer) {
      return;
    }
    setPlayers((current) => current.filter((_, playerIndex) => playerIndex !== index));
  }

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeamMessage(null);

    if (!teamValidation.success) {
      const firstIssue = teamValidation.error.issues.at(0);
      setTeamMessage({
        tone: "error",
        text: firstIssue?.message ?? "Invalid team registration payload.",
      });
      return;
    }

    setTeamSubmitting(true);

    try {
      const response = await fetch("/api/register/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamValidation.data),
      });

      const body = (await response.json()) as ApiEnvelope<{
        registrationId: string;
        status: "pending";
      }>;

      if (!body.success) {
        setTeamMessage({ tone: "error", text: body.error });
        return;
      }

      setTeamMessage({
        tone: "success",
        text: `Team submitted. Registration ID: ${body.data.registrationId}`,
      });
      setTeamName("");
      setCaptainDiscordId("");
      setTeamEmail("");
      setTeamLogoUrl("");
      setTeamTag("");
      setPlayers(Array.from({ length: 2 }, createEmptyPlayer));
    } catch {
      setTeamMessage({
        tone: "error",
        text: "Unable to submit team registration. Please try again.",
      });
    } finally {
      setTeamSubmitting(false);
    }
  }

  async function submitSolo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSoloMessage(null);

    if (!soloValidation.success) {
      const firstIssue = soloValidation.error.issues.at(0);
      setSoloMessage({
        tone: "error",
        text: firstIssue?.message ?? "Invalid solo registration payload.",
      });
      return;
    }

    setSoloSubmitting(true);

    try {
      const response = await fetch("/api/register/solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(soloValidation.data),
      });

      const body = (await response.json()) as ApiEnvelope<{
        registrationId: string;
        status: "available";
      }>;

      if (!body.success) {
        setSoloMessage({ tone: "error", text: body.error });
        return;
      }

      setSoloMessage({
        tone: "success",
        text: `Free agent registration submitted. ID: ${body.data.registrationId}`,
      });
      setSoloPlayer({
        name: "",
        riotId: "",
        discordId: "",
        preferredRole: "flex",
        eventId: "",
      });
      setSoloEmail("");
    } catch {
      setSoloMessage({
        tone: "error",
        text: "Unable to submit solo registration. Please try again.",
      });
    } finally {
      setSoloSubmitting(false);
    }
  }

  if (mode === "chooser") {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("team")}
          className="rounded-xl border border-zinc-200 bg-white p-6 text-left shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-xl font-semibold">Team Registration</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Register a full team with 2-6 players, captain validation, and role
            assignments.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("solo")}
          className="rounded-xl border border-zinc-200 bg-white p-6 text-left shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-xl font-semibold">Solo Registration</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Register as a free agent with preferred role and optional rank details.
          </p>
        </button>
      </div>
    );
  }

  if (mode === "team") {
    return (
      <form
        onSubmit={submitTeam}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Team Registration Form</h2>
          <button
            type="button"
            onClick={() => setMode("chooser")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            Back
          </button>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Section 1: Team Info
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Team Name
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm font-medium">
              Captain Discord ID
              <input
                value={captainDiscordId}
                onChange={(event) => setCaptainDiscordId(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm font-medium">
              Email (optional)
              <input
                type="email"
                value={teamEmail}
                onChange={(event) => setTeamEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm font-medium">
              Team Logo URL (optional)
              <input
                value={teamLogoUrl}
                onChange={(event) => setTeamLogoUrl(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm font-medium">
              Team Tag (optional, max 5 chars)
              <input
                value={teamTag}
                onChange={(event) => setTeamTag(event.target.value)}
                maxLength={5}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700">
              <p>
                Event ID:{" "}
                <span className="font-mono">{eventId || "(missing in URL)"}</span>
              </p>
              <p className="mt-1 text-zinc-500">
                Source: <code>?eventId=...</code>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Section 2: Players
            </h3>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {players.length}/6 Players Added
            </p>
          </div>

          {players.map((player, index) => (
            <div
              key={`team-player-${index}`}
              className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">Player {index + 1}</h4>
                {canRemovePlayer ? (
                  <button
                    type="button"
                    onClick={() => removePlayerSlot(index)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={player.name}
                  onChange={(event) =>
                    updatePlayer(index, "name", event.target.value)
                  }
                  required
                  placeholder="Player Name"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  value={player.riotId}
                  onChange={(event) =>
                    updatePlayer(index, "riotId", event.target.value)
                  }
                  required
                  placeholder="Riot ID (Name#Tag)"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  value={player.discordId}
                  onChange={(event) =>
                    updatePlayer(index, "discordId", event.target.value)
                  }
                  required
                  placeholder="Discord ID"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <select
                  value={player.role}
                  onChange={(event) => updatePlayer(index, "role", event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addPlayerSlot}
            disabled={!canAddPlayer}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700"
          >
            Add Player
          </button>
        </section>

        {teamValidationMessages.length > 0 ? (
          <ul className="mt-5 space-y-1 text-sm text-red-600">
            {teamValidationMessages.map((message) => (
              <li key={message}>• {message}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5">
          <button
            type="submit"
            disabled={teamSubmitting || !teamValidation.success}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {teamButtonText}
          </button>
        </div>

        {teamMessage ? (
          <p
            className={`mt-4 text-sm ${
              teamMessage.tone === "success" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {teamMessage.text}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={submitSolo}
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Free Agent Registration Form</h2>
        <button
          type="button"
          onClick={() => setMode("chooser")}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Back
        </button>
      </div>

      <div className="grid gap-3">
        <label className="block text-sm font-medium">
          Player Name
          <input
            value={soloPlayer.name}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-sm font-medium">
          Riot ID
          <input
            value={soloPlayer.riotId}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                riotId: event.target.value,
              }))
            }
            required
            placeholder="Name#Tag"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-sm font-medium">
          Discord ID
          <input
            value={soloPlayer.discordId}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                discordId: event.target.value,
              }))
            }
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-sm font-medium">
          Preferred Role
          <select
            value={soloPlayer.preferredRole}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                preferredRole: event.target.value as PlayerRole,
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Email (optional)
          <input
            type="email"
            value={soloEmail}
            onChange={(event) => setSoloEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-sm font-medium">
          Current Rank (optional)
          <select
            value={soloPlayer.currentRank ?? ""}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                currentRank: event.target.value
                  ? (event.target.value as PlayerRank)
                  : undefined,
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Not specified</option>
            {RANK_OPTIONS.map((rank) => (
              <option key={rank.value} value={rank.value}>
                {rank.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Peak Rank (optional)
          <select
            value={soloPlayer.peakRank ?? ""}
            onChange={(event) =>
              setSoloPlayer((current) => ({
                ...current,
                peakRank: event.target.value
                  ? (event.target.value as PlayerRank)
                  : undefined,
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Not specified</option>
            {RANK_OPTIONS.map((rank) => (
              <option key={rank.value} value={rank.value}>
                {rank.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700">
          <p>
            Event ID: <span className="font-mono">{eventId || "(missing in URL)"}</span>
          </p>
          <p className="mt-1 text-zinc-500">
            Source: <code>?eventId=...</code>
          </p>
        </div>
      </div>

      {soloValidationMessages.length > 0 ? (
        <ul className="mt-5 space-y-1 text-sm text-red-600">
          {soloValidationMessages.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={soloSubmitting || !soloValidation.success}
        className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {soloButtonText}
      </button>

      {soloMessage ? (
        <p
          className={`mt-4 text-sm ${
            soloMessage.tone === "success" ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {soloMessage.text}
        </p>
      ) : null}
    </form>
  );
}
