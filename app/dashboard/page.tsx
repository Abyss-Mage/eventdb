import type { Metadata } from "next";

import { DASHBOARD_NAV_ITEMS, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";
import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { ActionLinkCard } from "@/app/ui/action-link-card";

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
          <ActionLinkCard
            key={item.href}
            href={item.href}
            title={item.label}
            description={item.href}
            className="p-4"
          />
        ))}
      </section>
    </div>
  );
}
