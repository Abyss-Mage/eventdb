"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";
import { formatEventStatus } from "@/app/dashboard/events/event-management-utils";
import type { BracketRecord, EventRecord } from "@/lib/domain/types";

type EventsResponse =
  | { success: true; data: { events: EventRecord[] } }
  | { success: false; error: string };

type BracketsResponse =
  | { success: true; data: { brackets: BracketRecord[] } }
  | { success: false; error: string };

type GenerateBracketResponse =
  | { success: true; data: { bracket: BracketRecord } }
  | { success: false; error: string };

type InlineMessage =
  | { tone: "success"; text: string }
  | { tone: "error"; text: string };

function resolveEventSelection(events: EventRecord[], selectedEventId: string): string {
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

function parseStructureSummary(structureJson: string): {
  teamCount: number;
  matchCount: number;
  roundCount: number;
} {
  try {
    const parsed = JSON.parse(structureJson) as {
      metadata?: { teamCount?: number; roundCount?: number };
      matches?: unknown[];
      seededTeams?: unknown[];
    };
    return {
      teamCount:
        parsed.metadata?.teamCount ??
        (Array.isArray(parsed.seededTeams) ? parsed.seededTeams.length : 0),
      matchCount: Array.isArray(parsed.matches) ? parsed.matches.length : 0,
      roundCount: parsed.metadata?.roundCount ?? 0,
    };
  } catch {
    return { teamCount: 0, matchCount: 0, roundCount: 0 };
  }
}

export function BracketsClient() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [publishOnGenerate, setPublishOnGenerate] = useState(false);
  const [brackets, setBrackets] = useState<BracketRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<InlineMessage | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const fetchBrackets = useCallback(async (eventId: string) => {
    if (!eventId) {
      setBrackets([]);
      return;
    }

    const response = await fetch(
      `/api/admin/brackets?eventId=${encodeURIComponent(eventId)}&limit=25`,
      { method: "GET" },
    );
    const body = (await response.json()) as BracketsResponse;
    if (!body.success) {
      throwAdminGuardError(response.status, body.error);
      throw new Error(body.error);
    }

    setBrackets(body.data.brackets);
  }, []);

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        const response = await fetch("/api/admin/events?limit=100", { method: "GET" });
        const body = (await response.json()) as EventsResponse;
        if (!body.success) {
          throwAdminGuardError(response.status, body.error);
          throw new Error(body.error);
        }

        setEvents(body.data.events);
        const nextEventId = resolveEventSelection(body.data.events, "");
        setSelectedEventId(nextEventId);
        await fetchBrackets(nextEventId);
      } catch (error) {
        if (applyAdminGuardRedirect(router, error)) {
          return;
        }
        setMessage({
          tone: "error",
          text:
            error instanceof Error && error.message
              ? error.message
              : "Unable to load bracket data.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [fetchBrackets, router]);

  async function handleEventChange(nextEventId: string) {
    setSelectedEventId(nextEventId);
    setMessage(null);
    setIsRefreshing(true);
    try {
      await fetchBrackets(nextEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }
      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to load bracket snapshots for this event.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRefresh() {
    if (!selectedEventId) {
      return;
    }

    setMessage(null);
    setIsRefreshing(true);
    try {
      await fetchBrackets(selectedEventId);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }
      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to refresh bracket snapshots.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleGenerateBracket() {
    if (!selectedEventId) {
      setMessage({ tone: "error", text: "Select an event first." });
      return;
    }

    setMessage(null);
    setIsGenerating(true);
    try {
      const response = await fetch("/api/admin/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          state: publishOnGenerate ? "published" : "draft",
        }),
      });
      const body = (await response.json()) as GenerateBracketResponse;
      if (!body.success) {
        throwAdminGuardError(response.status, body.error);
        throw new Error(body.error);
      }

      setBrackets((current) => [body.data.bracket, ...current]);
      setMessage({
        tone: "success",
        text: `Generated bracket v${body.data.bracket.version} (${body.data.bracket.format.replaceAll("_", " ")}).`,
      });
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }
      setMessage({
        tone: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Unable to generate bracket snapshot.",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="surface-base surface-elevated grid gap-4 p-5 xl:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <label htmlFor="bracket-event" className="type-caption text-muted">
            Event
          </label>
          <select
            id="bracket-event"
            className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            value={selectedEventId}
            onChange={(event) => void handleEventChange(event.target.value)}
            disabled={isLoading || isRefreshing || isGenerating}
          >
            {events.length === 0 ? <option value="">No events available</option> : null}
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} ({formatEventStatus(event.status)})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {selectedEvent
              ? `Format: ${selectedEvent.format?.replaceAll("_", " ") ?? "not set"}`
              : "Select an event to load bracket snapshots."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-xs text-muted dark:border-zinc-700">
            <input
              type="checkbox"
              checked={publishOnGenerate}
              onChange={(event) => setPublishOnGenerate(event.target.checked)}
              disabled={isLoading || isRefreshing || isGenerating}
            />
            Publish immediately
          </label>
          <button
            type="button"
            onClick={() => void handleGenerateBracket()}
            className="btn-base btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!selectedEventId || isLoading || isRefreshing || isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Bracket"}
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="btn-base btn-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!selectedEventId || isLoading || isRefreshing || isGenerating}
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

      {isLoading ? <p className="status-message status-default">Loading brackets...</p> : null}

      {!isLoading && brackets.length === 0 ? (
        <article className="surface-base surface-elevated p-5">
          <p className="status-message status-default">
            No bracket snapshots found for this event.
          </p>
        </article>
      ) : null}

      <div className="space-y-4">
        {brackets.map((bracket) => {
          const summary = parseStructureSummary(bracket.structureJson);
          return (
            <article key={bracket.id} className="surface-base surface-elevated p-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <p>
                  <span className="font-medium text-soft">Version:</span> v{bracket.version}
                </p>
                <p>
                  <span className="font-medium text-soft">Format:</span>{" "}
                  {bracket.format.replaceAll("_", " ")}
                </p>
                <p>
                  <span className="font-medium text-soft">State:</span> {bracket.state}
                </p>
                <p>
                  <span className="font-medium text-soft">Bracket ID:</span>{" "}
                  <span className="font-mono text-xs">{bracket.id}</span>
                </p>
                <p>
                  <span className="font-medium text-soft">Teams:</span> {summary.teamCount}
                </p>
                <p>
                  <span className="font-medium text-soft">Matches:</span> {summary.matchCount}
                </p>
                <p>
                  <span className="font-medium text-soft">Rounds:</span> {summary.roundCount}
                </p>
                <p>
                  <span className="font-medium text-soft">Generated By:</span>{" "}
                  <span className="font-mono text-xs">{bracket.generatedByUserId}</span>
                </p>
                <p>
                  <span className="font-medium text-soft">Created:</span>{" "}
                  {formatDateTime(bracket.createdAt)}
                </p>
                <p>
                  <span className="font-medium text-soft">Published:</span>{" "}
                  {formatDateTime(bracket.publishedAt)}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
