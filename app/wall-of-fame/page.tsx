"use client";

import { useEffect, useState } from "react";

import type { EventRecord, MvpCandidate, MvpSummary } from "@/lib/domain/types";
import { PublicPageShell } from "@/app/ui/public-page-shell";
import { PUBLIC_PAGE_IMAGE_SLOTS } from "@/app/ui/public-image-slots";
import styles from "@/app/public-pages.module.css";

type WallOfFameResponse =
  | {
      success: true;
      data: {
        event: EventRecord | null;
        summary: MvpSummary | null;
        candidates: MvpCandidate[];
      };
    }
  | { success: false; error: string };

function formatGeneratedAt(value: string | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
}

export default function WallOfFamePage() {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [summary, setSummary] = useState<MvpSummary | null>(null);
  const [candidates, setCandidates] = useState<MvpCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadWall() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/public/wall-of-fame?limit=25", {
          method: "GET",
        });
        const body = (await response.json()) as WallOfFameResponse;
        if (!body.success) {
          if (!isMounted) {
            return;
          }
          setErrorMessage(body.error);
          return;
        }

        if (!isMounted) {
          return;
        }
        setEvent(body.data.event);
        setSummary(body.data.summary);
        setCandidates(body.data.candidates);
      } catch {
        if (!isMounted) {
          return;
        }
        setErrorMessage("Unable to load wall of fame.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadWall();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PublicPageShell
      activePage="wall-of-fame"
      eyebrow="Season 1 · Wall of Fame"
      title="Wall of Fame"
      description="Live MVP ladder and top performers from the latest active event."
      heroImageUrl={PUBLIC_PAGE_IMAGE_SLOTS.wallOfFameHero}
    >
      <div className={styles.panel}>
        {isLoading ? <p className={styles.statusLine}>Loading wall of fame...</p> : null}
        {!isLoading && errorMessage ? <p className={`${styles.statusLine} ${styles.error}`}>{errorMessage}</p> : null}
        {!isLoading && !errorMessage ? (
          <p className={styles.statusLine}>
            Event: {event?.name ?? "N/A"} · Last Update: {formatGeneratedAt(summary?.generatedAt)}
          </p>
        ) : null}
      </div>

      {!isLoading && !errorMessage && candidates.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.statusLine}>No MVP summary is available for the current event yet.</p>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className={styles.cardGrid}>
          {candidates.map((candidate) => (
            <article key={`${candidate.eventId}-${candidate.playerId}-${candidate.teamId}`} className={styles.card}>
              <h3>Rank #{candidate.rank}</h3>
              <p>Player: {candidate.playerId}</p>
              <p>Team: {candidate.teamId}</p>
              <p>Score: {candidate.score}</p>
              <p>K / D / A: {candidate.kills} / {candidate.deaths} / {candidate.assists}</p>
            </article>
          ))}
        </div>
      ) : null}
    </PublicPageShell>
  );
}
