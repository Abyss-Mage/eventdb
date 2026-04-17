import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const metadata: Metadata = {
  title: "Matches",
};

export default function DashboardMatchesPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Matches"
        description="Manage match scheduling, scores, and status updates."
      />
      <EventManagementClient sections={["matches"]} />
    </div>
  );
}
