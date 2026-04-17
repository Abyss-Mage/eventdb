import "server-only";

import {
  type AdminAuthSession,
  getAdminAuthSession,
  isAdminMfaSatisfied,
} from "@/lib/appwrite/auth-session";
import { isAdminAuthSession } from "@/lib/appwrite/admin-role";
import { HttpError } from "@/lib/errors/http-error";
import { failure } from "@/lib/http/response";

export type AdminRouteHandler = (
  request: Request,
  auth: AdminAuthSession,
) => Promise<Response>;

type AdminRouteAuthOptions = {
  requireMfa?: boolean;
};

function getMfaErrorMessage(auth: AdminAuthSession): string | null {
  if (isAdminMfaSatisfied(auth.mfa)) {
    return null;
  }

  if (auth.mfa.setupRequired) {
    return "TOTP setup required.";
  }

  return "MFA challenge required.";
}

export async function requireAdminAuthSession(
  options?: AdminRouteAuthOptions,
): Promise<AdminAuthSession> {
  const auth = await getAdminAuthSession();
  if (!auth) {
    throw new HttpError("Authentication required.", 401);
  }

  const isAdmin = await isAdminAuthSession(auth);
  if (!isAdmin) {
    throw new HttpError("Admin access required.", 403);
  }

  if (options?.requireMfa ?? true) {
    const mfaErrorMessage = getMfaErrorMessage(auth);
    if (mfaErrorMessage) {
      throw new HttpError(mfaErrorMessage, 403);
    }
  }

  return auth;
}

export async function withAdminRouteAuth(
  request: Request,
  handler: AdminRouteHandler,
  options?: AdminRouteAuthOptions,
): Promise<Response> {
  const auth = await getAdminAuthSession();
  if (!auth) {
    return failure("Authentication required.", 401);
  }

  const isAdmin = await isAdminAuthSession(auth);
  if (!isAdmin) {
    return failure("Admin access required.", 403);
  }

  if (options?.requireMfa ?? true) {
    const mfaErrorMessage = getMfaErrorMessage(auth);
    if (mfaErrorMessage) {
      return failure(mfaErrorMessage, 403);
    }
  }

  return handler(request, auth);
}
