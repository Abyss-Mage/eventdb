import { requireDashboardAdminAuthSession } from "@/app/admin/admin-route-guard";

export async function requireAdminDashboardAuth() {
  return requireDashboardAdminAuthSession();
}
