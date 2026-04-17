import {
  AppwriteException,
  AuthenticationFactor,
} from "node-appwrite";

import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { createAdminSessionAccount } from "@/lib/appwrite/auth-session";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStatusCode(code: number): number {
  if (code >= 400 && code <= 599) {
    return code;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    return withAdminRouteAuth(
      request,
      async (_, auth) => {
        const actor = getAdminAuditActor(auth);

        if (auth.mfa.setupRequired) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.create",
            resourceType: "mfa",
            status: "failure",
            details: { reason: "totp_setup_required" },
          });
          return failure("TOTP setup required before challenge.", 400);
        }

        if (auth.mfa.verified) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.create",
            resourceType: "mfa",
            status: "success",
            details: { challengeRequired: false },
          });
          return success({ verified: true as const, challengeRequired: false as const });
        }

        try {
          const account = createAdminSessionAccount(auth.sessionSecret);
          const challenge = await account.createMFAChallenge({
            factor: AuthenticationFactor.Totp,
          });

          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.create",
            resourceType: "mfa",
            resourceId: challenge.$id,
            status: "success",
            details: { challengeRequired: true },
          });

          return success({
            challengeId: challenge.$id,
            expire: challenge.expire,
            factor: "totp" as const,
          });
        } catch (error) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.create",
            resourceType: "mfa",
            status: "failure",
            details: {
              reason: "appwrite_error",
              errorMessage:
                error instanceof AppwriteException
                  ? error.message
                  : getErrorMessage(error),
            },
          });

          if (error instanceof AppwriteException) {
            if (error.code === 429) {
              return failure(
                "Too many MFA attempts. Please try again later.",
                429,
              );
            }

            return failure(
              error.message || "Unable to create MFA challenge.",
              getStatusCode(error.code),
            );
          }

          return failure(getErrorMessage(error), 500);
        }
      },
      { requireMfa: false },
    );
  } catch (error) {
    await writeAdminAuditLogBestEffort({
      actorUserId: "anonymous",
      action: "admin.mfa.challenge.create",
      resourceType: "mfa",
      status: "failure",
      details: {
        reason: "route_error",
        errorMessage: getErrorMessage(error),
      },
    });
    return failure(getErrorMessage(error), 500);
  }
}
