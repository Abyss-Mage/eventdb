import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { DashboardClient } from "@/app/dashboard/dashboard-client";

export const metadata: Metadata = {
  title: "Registrations",
};

export default function DashboardRegistrationsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Registrations"
        description="Review pending registrations and approve or reject entries."
      />
      <DashboardClient />
    </div>
  );
}
