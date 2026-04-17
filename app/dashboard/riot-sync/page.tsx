import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const metadata: Metadata = {
  title: "Riot Sync",
};

export default function DashboardRiotSyncPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Riot Sync"
        description="Verify Riot integration config and run manual sync jobs."
      />
      <EventManagementClient sections={["riotSync"]} />
    </div>
  );
}
