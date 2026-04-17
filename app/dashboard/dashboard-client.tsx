"use client";

import { useCallback, useEffect, useState } from "react";

import type { RegistrationRecord } from "@/lib/domain/types";

type RegistrationsResponse =
  | {
      success: true;
      data: {
        registrations: RegistrationRecord[];
      };
    }
  | {
      success: false;
      error: string;
    };

type ActionResponse =
  | { success: true; data: { registrationId: string; status: "approved" | "rejected" } }
  | { success: false; error: string };

export function DashboardClient() {
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionPendingFor, setActionPendingFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});

  const fetchPendingRegistrations = useCallback(async (): Promise<
    RegistrationRecord[]
  > => {
    const response = await fetch("/api/admin/registrations?status=pending", {
      method: "GET",
    });
    const body = (await response.json()) as RegistrationsResponse;

    if (!body.success) {
      throw new Error(body.error);
    }

    return body.data.registrations;
  }, []);

  const refreshRegistrations = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextRegistrations = await fetchPendingRegistrations();
      setRegistrations(nextRegistrations);
    } catch (error) {
      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load registrations.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchPendingRegistrations]);

  useEffect(() => {
    const run = async () => {
      try {
        const nextRegistrations = await fetchPendingRegistrations();
        setRegistrations(nextRegistrations);
      } catch (error) {
        if (error instanceof Error && error.message) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("Unable to load registrations.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [fetchPendingRegistrations]);

  async function runAdminAction(
    endpoint: "/api/admin/approve" | "/api/admin/reject",
    registrationId: string,
    reason?: string,
  ) {
    setActionPendingFor(registrationId);
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          endpoint === "/api/admin/reject"
            ? { registrationId, reason }
            : { registrationId },
        ),
      });

      const body = (await response.json()) as ActionResponse;
      if (!body.success) {
        setErrorMessage(body.error);
        return;
      }

      setRegistrations((current) =>
        current.filter((item) => item.id !== registrationId),
      );
    } catch {
      setErrorMessage("Admin action failed.");
    } finally {
      setActionPendingFor(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Pending Registrations</h2>
        <button
          type="button"
          onClick={() => void refreshRegistrations()}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Refresh
        </button>
      </div>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {isLoading ? <p className="text-sm text-zinc-500">Loading registrations...</p> : null}

      {!isLoading && registrations.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          No pending registrations.
        </p>
      ) : null}

      <div className="grid gap-4">
        {registrations.map((registration) => {
          const isPending = actionPendingFor === registration.id;
          const rejectReason = rejectReasonById[registration.id] ?? "";

          return (
            <article
              key={registration.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-500">
                  ID: <span className="font-mono">{registration.id}</span>
                </p>
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  {registration.type}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                <h3 className="text-lg font-semibold">{registration.teamName}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Captain Discord: {registration.captainDiscordId}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Event: {registration.eventId}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Players: {registration.players.map((player) => player.riotId).join(", ")}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  value={rejectReason}
                  onChange={(event) =>
                    setRejectReasonById((current) => ({
                      ...current,
                      [registration.id]: event.target.value,
                    }))
                  }
                  placeholder="Optional rejection reason"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    void runAdminAction("/api/admin/reject", registration.id, rejectReason)
                  }
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-800 dark:text-red-300"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void runAdminAction("/api/admin/approve", registration.id)}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Approve
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
