import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { PastEventsClient } from "@/app/dashboard/past-events/past-events-client";

export const metadata: Metadata = {
  title: "Past Events",
};

export default function DashboardPastEventsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Past Events"
        description="Review archived and completed events with read-only historical outcomes."
      />
      <PastEventsClient />
    </div>
  );
}
