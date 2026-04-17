import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { redirectAuthenticatedAdminFromLogin } from "@/app/admin/admin-route-guard";
import { ADMIN_ROUTES } from "@/app/admin/admin-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminEntryPage() {
  await redirectAuthenticatedAdminFromLogin();
  redirect(ADMIN_ROUTES.login);
}
