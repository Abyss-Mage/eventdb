"use client";

import { useEffect, useState } from "react";

import type { EventRecord } from "@/lib/domain/types";
import { PublicPageShell } from "@/app/ui/public-page-shell";
import { PUBLIC_PAGE_IMAGE_SLOTS } from "@/app/ui/public-image-slots";
import styles from "@/app/public-pages.module.css";

type ActiveEventResponse =
  | { success: true; data: { event: EventRecord | null } }
  | { success: false; error: string };

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
}

export default function EventPage() {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEvent() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/public/events/active", { method: "GET" });
        const body = (await response.json()) as ActiveEventResponse;
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
      } catch {
        if (!isMounted) {
          return;
        }
        setErrorMessage("Unable to load event details.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadEvent();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PublicPageShell
      activePage="event"
      eyebrow="Season 1 · Event"
      title="Current Event"
      description="Season 1 event status, key windows, and registration timeline."
      heroImageUrl={PUBLIC_PAGE_IMAGE_SLOTS.eventHero}
    >
      <div className={styles.panel}>
        {isLoading ? <p className={styles.statusLine}>Loading active event...</p> : null}
        {!isLoading && errorMessage ? <p className={`${styles.statusLine} ${styles.error}`}>{errorMessage}</p> : null}
        {!isLoading && !errorMessage && !event ? (
          <p className={styles.statusLine}>No active event is available right now.</p>
        ) : null}
        {event ? (
          <>
            <p className={styles.statusLine}>
              Active Event: {event.name} ({event.code}) · {event.status.replaceAll("_", " ")}
            </p>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <h3>Registration Opens</h3>
                <p>{formatDate(event.registrationOpensAt)}</p>
              </article>
              <article className={styles.card}>
                <h3>Registration Closes</h3>
                <p>{formatDate(event.registrationClosesAt)}</p>
              </article>
              <article className={styles.card}>
                <h3>Event Window</h3>
                <p>
                  {formatDate(event.startsAt)} — {formatDate(event.endsAt)}
                </p>
              </article>
            </div>
          </>
        ) : null}
      </div>
    </PublicPageShell>
  );
}
