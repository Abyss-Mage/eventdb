import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const metadata: Metadata = {
  title: "MVP",
};

export default function DashboardMvpPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="MVP"
        description="Review MVP candidates and recompute event MVP summaries."
      />
      <EventManagementClient sections={["mvp"]} />
    </div>
  );
}
