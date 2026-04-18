import type { Metadata } from "next";

import { BracketsClient } from "@/app/dashboard/brackets/brackets-client";
import { DashboardPageHeader } from "@/app/dashboard/dashboard-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Brackets",
};

export default function DashboardBracketsPage() {
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Brackets"
        description="Generate and review bracket snapshots for single elimination, double elimination, and league events."
      />
      <BracketsClient />
    </div>
  );
}
