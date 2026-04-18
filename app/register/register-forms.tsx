"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { soloRegistrationSchema, teamRegistrationSchema } from "@/lib/domain/schemas";
import type { PlayerRank, PlayerRole, TeamPlayerInput } from "@/lib/domain/types";
import styles from "./register.module.css";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type RegistrationMode = "solo" | "team";

type RegisterFormsProps = {
  eventId: string;
  registrationToken: string;
  lockMode?: RegistrationMode;
};

type TeamPlayerForm = TeamPlayerInput & {
  isCaptain: boolean;
  localId: string;
};

const MIN_TEAM_PLAYERS = 2;
const MAX_TEAM_PLAYERS = 6;

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
    localId: `player-${Math.random().toString(16).slice(2, 10)}`,
    name: "",
    riotId: "",
    discordId: "",
    role: "flex",
    isCaptain: false,
  };
}

function normalizedOptional(value: string): string | undefined {
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function toRole(value: string): PlayerRole {
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "duelist" ||
    normalized === "controller" ||
    normalized === "initiator" ||
    normalized === "sentinel" ||
    normalized === "flex"
  ) {
    return normalized;
  }
  return "flex";
}

export function RegisterForms({ eventId, registrationToken, lockMode }: RegisterFormsProps) {
  const [mode, setMode] = useState<RegistrationMode>(lockMode ?? "solo");
  const [teamStep, setTeamStep] = useState<1 | 2>(1);

  const [teamName, setTeamName] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [captainDiscordId, setCaptainDiscordId] = useState("");
  const [players, setPlayers] = useState<TeamPlayerForm[]>(() =>
    Array.from({ length: MIN_TEAM_PLAYERS }, (_, index) => ({
      ...createEmptyPlayer(),
      isCaptain: index === 0,
    })),
  );
  const [teamErrors, setTeamErrors] = useState<string[]>([]);
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);
  const [teamApiError, setTeamApiError] = useState<string | null>(null);

  const [soloName, setSoloName] = useState("");
  const [soloDiscord, setSoloDiscord] = useState("");
  const [soloRiot, setSoloRiot] = useState("");
  const [soloRole, setSoloRole] = useState<PlayerRole>("flex");
  const [soloCurrentRank, setSoloCurrentRank] = useState<PlayerRank | undefined>();
  const [soloPeakRank, setSoloPeakRank] = useState<PlayerRank | undefined>();
  const [soloErrors, setSoloErrors] = useState<string[]>([]);
  const [soloSubmitting, setSoloSubmitting] = useState(false);
  const [soloSuccess, setSoloSuccess] = useState<string | null>(null);
  const [soloApiError, setSoloApiError] = useState<string | null>(null);

  const querySuffix = useMemo(() => {
    const params = new URLSearchParams();
    if (eventId.trim()) {
      params.set("eventId", eventId.trim());
    }
    if (registrationToken.trim()) {
      params.set("token", registrationToken.trim());
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [eventId, registrationToken]);

  function selectType(next: RegistrationMode) {
    if (lockMode) {
      return;
    }
    setMode(next);
    setTeamApiError(null);
    setSoloApiError(null);
    setTeamSuccess(null);
    setSoloSuccess(null);
  }

  function setCaptain(playerId: string) {
    setPlayers((current) =>
      current.map((player) => ({
        ...player,
        isCaptain: player.localId === playerId,
      })),
    );
  }

  function updatePlayer(playerId: string, patch: Partial<TeamPlayerForm>) {
    setPlayers((current) =>
      current.map((player) =>
        player.localId === playerId ? { ...player, ...patch } : player,
      ),
    );
  }

  function addPlayer() {
    setPlayers((current) => {
      if (current.length >= MAX_TEAM_PLAYERS) {
        return current;
      }
      return [...current, createEmptyPlayer()];
    });
  }

  function removePlayer(playerId: string) {
    setPlayers((current) => {
      if (current.length <= MIN_TEAM_PLAYERS) {
        return current;
      }
      const next = current.filter((player) => player.localId !== playerId);
      if (!next.some((player) => player.isCaptain)) {
        next[0] = { ...next[0], isCaptain: true };
      }
      return next;
    });
  }

  function validateTeamStepOne() {
    const errors: string[] = [];
    if (!teamName.trim()) {
      errors.push("Team name is required.");
    }
    if (!captainDiscordId.trim()) {
      errors.push("Captain Discord ID is required.");
    }
    setTeamErrors(errors);
    return errors.length === 0;
  }

  async function submitTeam() {
    const payload = {
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
      teamTag: normalizedOptional(teamTag),
      teamLogoUrl: normalizedOptional(teamLogoUrl),
    };

    const captainPlayerIndex = players.findIndex((player) => player.isCaptain);
    if (
      captainPlayerIndex >= 0 &&
      !payload.players[captainPlayerIndex].discordId.trim() &&
      captainDiscordId.trim()
    ) {
      payload.players[captainPlayerIndex] = {
        ...payload.players[captainPlayerIndex],
        discordId: captainDiscordId.trim(),
      };
    }

    const parsed = teamRegistrationSchema.safeParse(payload);
    if (!parsed.success) {
      setTeamErrors(Array.from(new Set(parsed.error.issues.map((issue) => issue.message))));
      return;
    }

    setTeamSubmitting(true);
    setTeamErrors([]);
    setTeamApiError(null);

    try {
      const response = await fetch("/api/register/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as ApiEnvelope<{ registrationId: string }>;
      if (!body.success) {
        setTeamApiError(body.error);
        return;
      }
      setTeamSuccess(JSON.stringify(parsed.data, null, 2));
    } catch {
      setTeamApiError("Unable to submit team registration.");
    } finally {
      setTeamSubmitting(false);
    }
  }

  async function submitSolo() {
    const payload = {
      name: soloName.trim(),
      riotId: soloRiot.trim(),
      discordId: soloDiscord.trim(),
      preferredRole: soloRole,
      eventId,
      registrationToken: normalizedOptional(registrationToken),
      currentRank: soloCurrentRank,
      peakRank: soloPeakRank,
    };

    const parsed = soloRegistrationSchema.safeParse(payload);
    if (!parsed.success) {
      setSoloErrors(Array.from(new Set(parsed.error.issues.map((issue) => issue.message))));
      return;
    }

    setSoloSubmitting(true);
    setSoloErrors([]);
    setSoloApiError(null);

    try {
      const response = await fetch("/api/register/solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as ApiEnvelope<{ registrationId: string }>;
      if (!body.success) {
        setSoloApiError(body.error);
        return;
      }
      setSoloSuccess(JSON.stringify(parsed.data, null, 2));
    } catch {
      setSoloApiError("Unable to submit solo registration.");
    } finally {
      setSoloSubmitting(false);
    }
  }

  const playerCountFill = Math.min((players.length / MAX_TEAM_PLAYERS) * 100, 100);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.navBrand} href="/">
          Pub of Homies
        </Link>
        <ul className={styles.navLinks}>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/event">Event</Link></li>
          <li><Link href="/about">About</Link></li>
          <li><Link href="/contact">Contact</Link></li>
          <li><Link href="/wall-of-fame">Wall of Fame</Link></li>
          <li><Link href="/leaderboard">Leaderboard</Link></li>
          <li><Link className={styles.activeLink} href="/register">Register</Link></li>
        </ul>
      </nav>

      <section className={styles.pageHeader}>
        <p className={styles.headerEyebrow}>Season 1 · Valorant</p>
        <h1>Join the League</h1>
        <p>Choose your registration type and forge your legacy.</p>
      </section>

      <section className={styles.typeSelector}>
        <p className={styles.typeSelectorLabel}>Select Registration Type</p>
        <div className={styles.typeCards}>
          <button
            type="button"
            className={`${styles.typeCard} ${mode === "solo" ? styles.selected : ""}`}
            onClick={() => selectType("solo")}
            disabled={Boolean(lockMode)}
          >
            <span className={styles.typeCardIcon}>⚔ Solo Entry</span>
            <span className={styles.typeCardTitle}>Free Agent</span>
            <span className={styles.typeCardDesc}>
              Register as a solo player. Get matched with a team or compete independently in the ladder.
            </span>
          </button>
          <button
            type="button"
            className={`${styles.typeCard} ${mode === "team" ? styles.selected : ""}`}
            onClick={() => selectType("team")}
            disabled={Boolean(lockMode)}
          >
            <span className={styles.typeCardIcon}>⬡ Team Entry</span>
            <span className={styles.typeCardTitle}>Team</span>
            <span className={styles.typeCardDesc}>
              Register a full roster. One captain leads the charge into the tournament.
            </span>
          </button>
        </div>
      </section>

      <section className={styles.formArea}>
        {mode === "solo" ? (
          <>
            {soloErrors.length > 0 ? (
              <div className={styles.validationSummary}>
                <div className={styles.validationSummaryTitle}>Fix the following before submitting</div>
                <ul>{soloErrors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}
            {soloApiError ? <p className={styles.apiError}>{soloApiError}</p> : null}
            {soloSuccess ? (
              <div className={styles.successPanel}>
                <h2>You&apos;re In.</h2>
                <p>Registration received.</p>
                <pre>{soloSuccess}</pre>
              </div>
            ) : null}

            {!soloSuccess ? (
              <div className={styles.formPanel}>
                <div className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Player Info</h3>
                  <div className={styles.fieldRow2}>
                    <div className={styles.field}>
                      <label>Player Name *</label>
                      <input value={soloName} onChange={(e) => setSoloName(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label>Discord ID *</label>
                      <input value={soloDiscord} onChange={(e) => setSoloDiscord(e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Riot ID *</label>
                    <input value={soloRiot} onChange={(e) => setSoloRiot(e.target.value)} />
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Gameplay Info</h3>
                  <div className={styles.field}>
                    <label>Preferred Role *</label>
                    <select value={soloRole} onChange={(e) => setSoloRole(toRole(e.target.value))}>
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Rank Info (Optional)</h3>
                  <div className={styles.rankGrid}>
                    {RANK_OPTIONS.map((rank) => (
                      <button
                        key={`current-${rank.value}`}
                        type="button"
                        className={`${styles.rankBtn} ${soloCurrentRank === rank.value ? styles.rankSelected : ""}`}
                        onClick={() => setSoloCurrentRank(rank.value)}
                      >
                        {rank.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.rankGrid}>
                    {RANK_OPTIONS.map((rank) => (
                      <button
                        key={`peak-${rank.value}`}
                        type="button"
                        className={`${styles.rankBtn} ${soloPeakRank === rank.value ? styles.rankSelected : ""}`}
                        onClick={() => setSoloPeakRank(rank.value)}
                      >
                        {rank.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formActionsEnd}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={soloSubmitting}
                    onClick={submitSolo}
                  >
                    Submit Registration →
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className={styles.stepIndicator}>
              <div className={`${styles.step} ${teamStep === 1 ? styles.stepActive : teamStep > 1 ? styles.stepDone : ""}`}>
                <span className={styles.stepNum}>1</span>
                <span className={styles.stepName}>Team Info</span>
              </div>
              <span className={styles.stepConnector} />
              <div className={`${styles.step} ${teamStep === 2 ? styles.stepActive : ""}`}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.stepName}>Players</span>
              </div>
            </div>

            {teamErrors.length > 0 ? (
              <div className={styles.validationSummary}>
                <div className={styles.validationSummaryTitle}>Fix the following before submitting</div>
                <ul>{teamErrors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}
            {teamApiError ? <p className={styles.apiError}>{teamApiError}</p> : null}
            {teamSuccess ? (
              <div className={styles.successPanel}>
                <h2>Roster Locked.</h2>
                <p>Team registration received.</p>
                <pre>{teamSuccess}</pre>
              </div>
            ) : null}

            {!teamSuccess && teamStep === 1 ? (
              <div className={styles.formPanel}>
                <div className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Team Identity</h3>
                  <div className={styles.fieldRow2}>
                    <div className={styles.field}>
                      <label>Team Name *</label>
                      <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={30} />
                    </div>
                    <div className={styles.field}>
                      <label>Team Tag (optional)</label>
                      <input value={teamTag} onChange={(e) => setTeamTag(e.target.value.toUpperCase())} maxLength={5} />
                    </div>
                  </div>
                  <div className={styles.fieldRow2}>
                    <div className={styles.field}>
                      <label>Captain Discord ID *</label>
                      <input value={captainDiscordId} onChange={(e) => setCaptainDiscordId(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label>Team Logo URL (optional)</label>
                      <input value={teamLogoUrl} onChange={(e) => setTeamLogoUrl(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className={styles.formActionsEnd}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      if (validateTeamStepOne()) {
                        setTeamStep(2);
                      }
                    }}
                  >
                    Continue: Add Players →
                  </button>
                </div>
              </div>
            ) : null}

            {!teamSuccess && teamStep === 2 ? (
              <div className={styles.formPanel}>
                <div className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Roster</h3>
                  <div className={styles.playerCounter}>
                    <span>{players.length} / {MAX_TEAM_PLAYERS} players added</span>
                    <div className={styles.counterBar}>
                      <span className={styles.counterBarFill} style={{ width: `${playerCountFill}%` }} />
                    </div>
                  </div>

                  <div className={styles.playersContainer}>
                    {players.map((player, index) => (
                      <div key={player.localId} className={styles.playerCard}>
                        <div className={styles.playerCardHeader}>
                          <div className={styles.playerHeaderLeft}>
                            <span className={styles.playerNum}>{index + 1}</span>
                            <span className={styles.playerNamePreview}>{player.name || `Player ${index + 1}`}</span>
                            {player.isCaptain ? <span className={styles.captainTag}>Captain</span> : null}
                          </div>
                          <button
                            type="button"
                            className={styles.btnRemovePlayer}
                            onClick={() => removePlayer(player.localId)}
                            disabled={players.length <= MIN_TEAM_PLAYERS}
                          >
                            Remove
                          </button>
                        </div>
                        <div className={styles.playerCardBody}>
                          <div className={styles.fieldRow2}>
                            <div className={styles.field}>
                              <label>Player Name *</label>
                              <input
                                value={player.name}
                                onChange={(e) => updatePlayer(player.localId, { name: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label>Riot ID *</label>
                              <input
                                value={player.riotId}
                                onChange={(e) => updatePlayer(player.localId, { riotId: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className={styles.fieldRow2}>
                            <div className={styles.field}>
                              <label>Discord ID *</label>
                              <input
                                value={player.discordId}
                                onChange={(e) => updatePlayer(player.localId, { discordId: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label>Role *</label>
                              <select
                                value={player.role}
                                onChange={(e) => updatePlayer(player.localId, { role: toRole(e.target.value) })}
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role.value} value={role.value}>
                                    {role.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`${styles.captainToggle} ${player.isCaptain ? styles.captainActive : ""}`}
                            onClick={() => setCaptain(player.localId)}
                          >
                            Set as Team Captain
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.btnAddPlayer}
                    onClick={addPlayer}
                    disabled={players.length >= MAX_TEAM_PLAYERS}
                  >
                    + Add Player
                  </button>
                </div>

                <div className={styles.formActions}>
                  <button type="button" className={styles.btnGhost} onClick={() => setTeamStep(1)}>
                    ← Back
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={teamSubmitting}
                    onClick={submitTeam}
                  >
                    Submit Roster →
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBottom}>
          <span className={styles.footerCopy}>
            © 2025 Pub of Homies. All rights reserved. Developed by Abyss Mage.
          </span>
          <Link className={styles.footerAdminLogin} href="/admin/login">
            Admin Login
          </Link>
        </div>
        <div className={styles.footerAccent} />
      </footer>

      {querySuffix ? (
        <div className={styles.contextBanner}>Context preserved: {querySuffix}</div>
      ) : null}
    </main>
  );
}
