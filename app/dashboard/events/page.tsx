import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { EventManagementClient } from "@/app/dashboard/events/event-management-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Events",
};

export default function DashboardEventsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Events"
        description="Create and manage events, then publish or archive them."
      />
      <EventManagementClient sections={["events"]} />
    </div>
  );
}
