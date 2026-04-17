import type { ReactNode } from "react";
import type { Metadata } from "next";

import { requireAdminDashboardAuth } from "@/app/dashboard/admin-auth";
import { AdminShell } from "@/app/dashboard/admin-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "Admin Dashboard",
    template: "%s | Admin Dashboard",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await requireAdminDashboardAuth();

  return <AdminShell userEmail={auth.user.email}>{children}</AdminShell>;
}
