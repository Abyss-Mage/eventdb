import "server-only";

import { redirect } from "next/navigation";

import { ADMIN_ROUTES, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";
import { isAdminAuthSession } from "@/lib/appwrite/admin-role";
import {
  type AdminAuthSession,
  getAdminAuthSession,
  isAdminMfaSatisfied,
} from "@/lib/appwrite/auth-session";

type AdminRouteState =
  | { kind: "unauthenticated" }
  | { kind: "not_admin" }
  | { kind: "mfa_required"; auth: AdminAuthSession }
  | { kind: "authorized"; auth: AdminAuthSession };

async function getAdminRouteState(): Promise<AdminRouteState> {
  const auth = await getAdminAuthSession();
  if (!auth) {
    return { kind: "unauthenticated" };
  }

  const isAdmin = await isAdminAuthSession(auth);
  if (!isAdmin) {
    return { kind: "not_admin" };
  }

  if (!isAdminMfaSatisfied(auth.mfa)) {
    return { kind: "mfa_required", auth };
  }

  return { kind: "authorized", auth };
}

export async function requireDashboardAdminAuthSession(): Promise<AdminAuthSession> {
  const state = await getAdminRouteState();

  if (state.kind === "unauthenticated" || state.kind === "not_admin") {
    redirect(ADMIN_ROUTES.login);
  }

  if (state.kind === "mfa_required") {
    redirect(ADMIN_ROUTES.twoFactor);
  }

  return state.auth;
}

export async function redirectAuthenticatedAdminFromLogin() {
  const state = await getAdminRouteState();

  if (state.kind === "mfa_required") {
    redirect(ADMIN_ROUTES.twoFactor);
  }

  if (state.kind === "authorized") {
    redirect(DASHBOARD_ROUTES.overview);
  }
}

export async function requireAdminTwoFactorSession(): Promise<AdminAuthSession> {
  const state = await getAdminRouteState();

  if (state.kind === "unauthenticated" || state.kind === "not_admin") {
    redirect(ADMIN_ROUTES.login);
  }

  if (state.kind === "authorized") {
    redirect(DASHBOARD_ROUTES.overview);
  }

  return state.auth;
}
