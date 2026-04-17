import Link from "next/link";

import { DASHBOARD_ROUTES } from "@/app/admin/admin-routes";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-14">
      <main className="space-y-10">
        <section className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Pub of Homies
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Esports League Management System
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
            Phase 1 is live: player registration and admin approvals powered by
            server-side Appwrite writes.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/register"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <h2 className="text-xl font-semibold">Register Players</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Submit team and solo entries with strict validation and pending status.
            </p>
          </Link>
          <Link
            href={DASHBOARD_ROUTES.overview}
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
          >
            <h2 className="text-xl font-semibold">Admin Dashboard</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Review pending registrations and approve or reject submissions.
            </p>
          </Link>
        </section>
      </main>
    </div>
  );
}
