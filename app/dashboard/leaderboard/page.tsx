import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const metadata: Metadata = {
  title: "Leaderboard",
};

export default function DashboardLeaderboardPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Leaderboard"
        description="Review standings and recompute leaderboard results."
      />
      <EventManagementClient sections={["leaderboard"]} />
    </div>
  );
}
