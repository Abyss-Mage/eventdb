import type { Metadata } from "next";

import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";
import { SettingsClient } from "@/app/dashboard/settings/settings-client";

export const metadata: Metadata = {
  title: "Settings",
};

export default function DashboardSettingsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Settings"
        description="Review admin session details and integration health."
      />
      <SettingsClient />
    </div>
  );
}
