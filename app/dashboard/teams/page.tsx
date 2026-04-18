import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { TeamsRosterClient } from "@/app/dashboard/teams/teams-roster-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Registered Teams",
};

export default function DashboardTeamsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Registered Teams"
        description="View approved team rosters with team/player IDs and full player fields for match and MVP operations."
      />
      <TeamsRosterClient />
    </div>
  );
}
