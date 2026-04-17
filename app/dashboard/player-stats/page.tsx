import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const metadata: Metadata = {
  title: "Player Stats",
};

export default function DashboardPlayerStatsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Player Stats"
        description="Filter, review, and edit player stat lines by event."
      />
      <EventManagementClient sections={["playerStats"]} />
    </div>
  );
}
