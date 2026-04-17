import type { Metadata } from "next";
import Link from "next/link";

import { DASHBOARD_NAV_ITEMS, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";
import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Overview",
};

export default function DashboardPage() {
  const quickLinks = DASHBOARD_NAV_ITEMS.filter(
    (item) => item.href !== DASHBOARD_ROUTES.overview,
  );

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Overview"
        description="Use the admin sections below to manage registrations, events, matches, and operations."
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {quickLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</p>
            <p className="mt-1 text-zinc-600 dark:text-zinc-300">{item.href}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
