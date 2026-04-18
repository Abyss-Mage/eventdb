"use client";

import { useEffect, useState } from "react";

import type { EventRecord, TeamStandingAggregate } from "@/lib/domain/types";
import { PublicPageShell } from "@/app/ui/public-page-shell";
import { PUBLIC_PAGE_IMAGE_SLOTS } from "@/app/ui/public-image-slots";
import styles from "@/app/public-pages.module.css";

type LeaderboardResponse =
  | {
      success: true;
      data: {
        event: EventRecord | null;
        standings: TeamStandingAggregate[];
      };
    }
  | { success: false; error: string };

export default function LeaderboardPage() {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [standings, setStandings] = useState<TeamStandingAggregate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadLeaderboard() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/public/leaderboard?limit=50", { method: "GET" });
        const body = (await response.json()) as LeaderboardResponse;
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
        setStandings(body.data.standings);
      } catch {
        if (!isMounted) {
          return;
        }
        setErrorMessage("Unable to load leaderboard.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadLeaderboard();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PublicPageShell
      activePage="leaderboard"
      eyebrow="Season 1 · Leaderboard"
      title="Leaderboard"
      description="Live standings from the latest active event."
      heroImageUrl={PUBLIC_PAGE_IMAGE_SLOTS.leaderboardHero}
    >
      <div className={styles.panel}>
        {isLoading ? <p className={styles.statusLine}>Loading leaderboard...</p> : null}
        {!isLoading && errorMessage ? <p className={`${styles.statusLine} ${styles.error}`}>{errorMessage}</p> : null}
        {!isLoading && !errorMessage ? (
          <p className={styles.statusLine}>
            Event: {event?.name ?? "N/A"} · Teams Ranked: {standings.length}
          </p>
        ) : null}
      </div>

      {!isLoading && !errorMessage && standings.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.statusLine}>No standings are available for the current event yet.</p>
        </div>
      ) : null}

      {standings.length > 0 ? (
        <div className={`${styles.panel} ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Matches</th>
                <th>Round Diff</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr key={`${standing.teamId}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{standing.teamName}</td>
                  <td>{standing.wins}</td>
                  <td>{standing.losses}</td>
                  <td>{standing.matchesPlayed}</td>
                  <td>{standing.roundDiff}</td>
                  <td>{standing.points ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PublicPageShell>
  );
}
