import { AppwriteException, AuthenticatorType } from "node-appwrite";

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

        if (!auth.mfa.setupRequired) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.create",
            resourceType: "mfa",
            status: "failure",
            details: { reason: "totp_already_configured" },
          });
          return failure("TOTP is already configured for this account.", 400);
        }

        try {
          const account = createAdminSessionAccount(auth.sessionSecret);
          const totp = await account.createMFAAuthenticator({
            type: AuthenticatorType.Totp,
          });

          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.create",
            resourceType: "mfa",
            status: "success",
            details: { setupRequired: auth.mfa.setupRequired },
          });

          return success({
            type: "totp" as const,
            secret: totp.secret,
            uri: totp.uri,
          });
        } catch (error) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.create",
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
            return failure(
              error.message || "Unable to create TOTP authenticator.",
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
      action: "admin.mfa.enroll.create",
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
