import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { TeamBuilderClient } from "@/app/dashboard/team-builder/team-builder-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team Builder",
};

export default function DashboardTeamBuilderPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Team Builder"
        description="Select solo players to create random teams of 5, or assign selected solo players to underfilled teams."
      />
      <TeamBuilderClient />
    </div>
  );
}
