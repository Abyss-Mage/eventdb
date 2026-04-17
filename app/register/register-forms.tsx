"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
import {
  ChoiceCard,
  cx,
  FormField,
  StatusMessage,
  SurfacePanel,
} from "@/app/ui/foundation";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type SubmissionMessage = {
  tone: "success" | "error";
  text: string;
};

type RegistrationMode = "chooser" | "team" | "solo";
type TeamPlayerForm = TeamPlayerInput;
type RegisterFormsProps = {
  eventId: string;
  registrationToken: string;
  lockMode?: Exclude<RegistrationMode, "chooser">;
};
type RegistrationFormHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
};
type RegistrationFormSectionProps = {
  title?: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
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

function RegistrationFormHeader({
  eyebrow,
  title,
  description,
  backLabel,
  onBack,
}: RegistrationFormHeaderProps) {
  return (
    <div className="registration-form-header">
      <div className="space-y-2">
        <p className="type-eyebrow">{eyebrow}</p>
        <h2 className="type-title">{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {onBack && backLabel ? (
        <button
          type="button"
          onClick={onBack}
          className="btn-base btn-ghost px-3 py-1.5 text-xs"
        >
          {backLabel}
        </button>
      ) : null}
    </div>
  );
}

function RegistrationFormSection({
  title,
  meta,
  className,
  children,
}: RegistrationFormSectionProps) {
  return (
    <section className={cx("registration-form-section", className)}>
      {title || meta ? (
        <div className="registration-form-section-head">
          {title ? <h3 className="type-eyebrow">{title}</h3> : null}
          {meta ? <div className="type-body-sm text-muted">{meta}</div> : null}
        </div>
      ) : null}
      <div className="registration-form-section-frame">{children}</div>
    </section>
  );
}

function ValidationIssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="registration-validation-list text-sm text-danger">
      {issues.map((message) => (
        <li key={message}>• {message}</li>
      ))}
    </ul>
  );
}

export function RegisterForms({
  eventId,
  registrationToken,
  lockMode,
}: RegisterFormsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<RegistrationMode>(lockMode ?? "chooser");

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
  const querySuffix = useMemo(() => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set("eventId", eventId);
    }
    if (registrationToken) {
      params.set("token", registrationToken);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [eventId, registrationToken]);

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
      registrationToken: normalizedOptional(registrationToken),
      email: normalizedOptional(teamEmail),
      teamLogoUrl: normalizedOptional(teamLogoUrl),
      teamTag: normalizedOptional(teamTag),
    }),
    [
      captainDiscordId,
      eventId,
      players,
      registrationToken,
      teamEmail,
      teamLogoUrl,
      teamName,
      teamTag,
    ],
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
      registrationToken: normalizedOptional(registrationToken),
      email: normalizedOptional(soloEmail),
      currentRank: soloPlayer.currentRank,
      peakRank: soloPlayer.peakRank,
    }),
    [eventId, registrationToken, soloEmail, soloPlayer],
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
    : "Submit Solo Player Registration";
  const backButtonLabel = lockMode ? "Back to options" : "Back";

  function navigateToForm(nextMode: Exclude<RegistrationMode, "chooser">) {
    router.push(`/register/${nextMode}${querySuffix}`);
  }

  function goBackToChooser() {
    if (lockMode) {
      router.push(`/register${querySuffix}`);
      return;
    }
    setMode("chooser");
  }

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
        text: `Solo player registration submitted. ID: ${body.data.registrationId}`,
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
      <SurfacePanel
        variant="elevated"
        className="registration-form-surface registration-form-surface--chooser space-y-5 p-4 sm:p-6"
      >
        <RegistrationFormHeader
          eyebrow="Select Registration Type"
          title="Start your submission"
          description="Team registration supports 2-6 players. Solo registration adds players to the solo player pool for admin team assignment."
        />

        <div className="registration-choice-grid">
          <ChoiceCard
            title="Team Registration"
            description="Register a full team with captain validation, role assignments, and up to six players."
            meta="2-6 players"
            onClick={() => navigateToForm("team")}
            className="registration-choice-card"
          />
          <ChoiceCard
            title="Solo Registration"
            description="Register as a solo player with preferred role and optional rank details."
            meta="Solo player pool"
            onClick={() => navigateToForm("solo")}
            className="registration-choice-card"
          />
        </div>
      </SurfacePanel>
    );
  }

  if (mode === "team") {
    return (
      <SurfacePanel
        variant="elevated"
        className="registration-form-surface border-red-300/40 p-4 sm:p-6 lg:p-7"
      >
        <form onSubmit={submitTeam} className="registration-form-content space-y-6">
          <RegistrationFormHeader
            eyebrow="Team Entry"
            title="Team Registration Form // Match Ops"
            description="Build a complete roster, assign roles, and submit your competitive lineup."
            backLabel={backButtonLabel}
            onBack={goBackToChooser}
          />

          <RegistrationFormSection title="Live status" className="space-y-3">
            <div className="registration-form-status-grid">
              <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  Roster Cap
                </p>
                <p className="mt-1 text-sm font-semibold text-soft">{players.length}/6 Active</p>
              </SurfacePanel>
              <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  Captain ID
                </p>
                <p className="mt-1 text-sm font-semibold text-soft">
                  {captainDiscordId.trim() ? "Ready" : "Required"}
                </p>
              </SurfacePanel>
              <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  Validation
                </p>
                <p className="mt-1 text-sm font-semibold text-soft">
                  {teamValidation.success ? "Green" : "Pending"}
                </p>
              </SurfacePanel>
            </div>
          </RegistrationFormSection>

          <RegistrationFormSection title="Section 1: Team Intel" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Team Name">
                <input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  required
                  className="input-control bg-slate-950/60"
                />
              </FormField>
              <FormField label="Captain Discord ID">
                <input
                  value={captainDiscordId}
                  onChange={(event) => setCaptainDiscordId(event.target.value)}
                  required
                  className="input-control bg-slate-950/60"
                />
              </FormField>
              <FormField label="Email (optional)">
                <input
                  type="email"
                  value={teamEmail}
                  onChange={(event) => setTeamEmail(event.target.value)}
                  className="input-control bg-slate-950/60"
                />
              </FormField>
              <FormField label="Team Logo URL (optional)">
                <input
                  value={teamLogoUrl}
                  onChange={(event) => setTeamLogoUrl(event.target.value)}
                  className="input-control bg-slate-950/60"
                />
              </FormField>
              <FormField label="Team Tag (optional, max 5 chars)">
                <input
                  value={teamTag}
                  onChange={(event) => setTeamTag(event.target.value)}
                  maxLength={5}
                  className="input-control bg-slate-950/60"
                />
              </FormField>
            </div>
          </RegistrationFormSection>

          <RegistrationFormSection
            title="Section 2: Player Stack"
            meta={`${players.length}/6 roster slots filled`}
            className="space-y-4"
          >
            {players.map((player, index) => (
              <SurfacePanel
                key={`team-player-${index}`}
                variant="subtle"
                className="registration-player-card border-white/15 bg-slate-950/58 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-red-300/50 bg-red-500/15 px-2 text-xs font-semibold text-red-100">
                      {index + 1}
                    </span>
                    <h4 className="type-label">Player Slot</h4>
                  </div>
                  {canRemovePlayer ? (
                    <button
                      type="button"
                      onClick={() => removePlayerSlot(index)}
                      className="btn-base btn-danger px-2.5 py-1 text-xs"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={player.name}
                    onChange={(event) =>
                      updatePlayer(index, "name", event.target.value)
                    }
                    required
                    placeholder="Player Name"
                    className="input-control bg-slate-950/60"
                  />
                  <input
                    value={player.riotId}
                    onChange={(event) =>
                      updatePlayer(index, "riotId", event.target.value)
                    }
                    required
                    placeholder="Riot ID (Name#Tag)"
                    className="input-control bg-slate-950/60"
                  />
                  <input
                    value={player.discordId}
                    onChange={(event) =>
                      updatePlayer(index, "discordId", event.target.value)
                    }
                    required
                    placeholder="Discord ID"
                    className="input-control bg-slate-950/60"
                  />
                  <select
                    value={player.role}
                    onChange={(event) => updatePlayer(index, "role", event.target.value)}
                    className="select-control bg-slate-950/60"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </SurfacePanel>
            ))}

            <div className="grid gap-2 md:grid-cols-[auto_1fr] md:items-center">
              <button
                type="button"
                onClick={addPlayerSlot}
                disabled={!canAddPlayer}
                className="btn-base btn-secondary w-full disabled:opacity-60 md:w-auto"
              >
                Add Player
              </button>
              <p className="text-xs text-muted">
                Minimum 2 players required. Maximum 6 roster slots.
              </p>
            </div>
          </RegistrationFormSection>

          <ValidationIssueList issues={teamValidationMessages} />

          <div className="registration-form-action-bar">
            <div className="registration-form-action-copy">
              <p className="text-sm font-semibold text-soft">Ready to submit this team roster?</p>
              <p className="text-xs text-muted">
                Submission routes to /api/register/team with existing validation rules.
              </p>
            </div>
            <button
              type="submit"
              disabled={teamSubmitting || !teamValidation.success}
              className="btn-base btn-primary w-full md:min-w-56 md:w-auto"
            >
              {teamButtonText}
            </button>
          </div>

          {teamMessage ? (
            <StatusMessage
              tone={teamMessage.tone === "success" ? "success" : "danger"}
              className="mt-1"
            >
              {teamMessage.text}
            </StatusMessage>
          ) : null}
        </form>
      </SurfacePanel>
    );
  }

  return (
    <SurfacePanel
      variant="elevated"
      className="registration-form-surface border-blue-300/40 p-4 sm:p-6 lg:p-7"
    >
      <form onSubmit={submitSolo} className="registration-form-content space-y-6">
        <RegistrationFormHeader
          eyebrow="Solo Entry"
          title="Solo Player Registration // Queue Intake"
          description="Register your profile and role preference to join the assignment draft."
          backLabel={backButtonLabel}
          onBack={goBackToChooser}
        />

        <RegistrationFormSection title="Live status" className="space-y-3">
          <div className="registration-form-status-grid">
            <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                Role Preference
              </p>
              <p className="mt-1 text-sm font-semibold text-soft">
                {soloPlayer.preferredRole}
              </p>
            </SurfacePanel>
            <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                Queue Status
              </p>
              <p className="mt-1 text-sm font-semibold text-soft">
                {soloValidation.success ? "Ready" : "Needs info"}
              </p>
            </SurfacePanel>
            <SurfacePanel variant="subtle" className="border-white/10 bg-slate-950/55 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                Contact
              </p>
              <p className="mt-1 text-sm font-semibold text-soft">
                {soloPlayer.discordId.trim() ? "Linked" : "Required"}
              </p>
            </SurfacePanel>
          </div>
        </RegistrationFormSection>

        <RegistrationFormSection title="Player Profile" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Player Name">
              <input
                value={soloPlayer.name}
                onChange={(event) =>
                  setSoloPlayer((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
                className="input-control bg-slate-950/60"
              />
            </FormField>
            <FormField label="Riot ID">
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
                className="input-control bg-slate-950/60"
              />
            </FormField>
            <FormField label="Discord ID">
              <input
                value={soloPlayer.discordId}
                onChange={(event) =>
                  setSoloPlayer((current) => ({
                    ...current,
                    discordId: event.target.value,
                  }))
                }
                required
                className="input-control bg-slate-950/60"
              />
            </FormField>
            <FormField label="Preferred Role">
              <select
                value={soloPlayer.preferredRole}
                onChange={(event) =>
                  setSoloPlayer((current) => ({
                    ...current,
                    preferredRole: event.target.value as PlayerRole,
                    }))
                }
                className="select-control bg-slate-950/60"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Email (optional)">
              <input
                type="email"
                value={soloEmail}
                onChange={(event) => setSoloEmail(event.target.value)}
                className="input-control bg-slate-950/60"
              />
            </FormField>
            <FormField label="Current Rank (optional)">
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
                className="select-control bg-slate-950/60"
              >
                <option value="">Not specified</option>
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank.value} value={rank.value}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Peak Rank (optional)">
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
                className="select-control bg-slate-950/60"
              >
                <option value="">Not specified</option>
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank.value} value={rank.value}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </RegistrationFormSection>

        <ValidationIssueList issues={soloValidationMessages} />

        <div className="registration-form-action-bar">
          <div className="registration-form-action-copy">
            <p className="text-sm font-semibold text-soft">Ready to enter the solo queue?</p>
            <p className="text-xs text-muted">
              Submission routes to /api/register/solo with existing validation rules.
            </p>
          </div>
          <button
            type="submit"
            disabled={soloSubmitting || !soloValidation.success}
            className="btn-base btn-primary w-full md:min-w-56 md:w-auto"
          >
            {soloButtonText}
          </button>
        </div>

        {soloMessage ? (
          <StatusMessage
            tone={soloMessage.tone === "success" ? "success" : "danger"}
            className="mt-1"
          >
            {soloMessage.text}
          </StatusMessage>
        ) : null}
      </form>
    </SurfacePanel>
  );
}
