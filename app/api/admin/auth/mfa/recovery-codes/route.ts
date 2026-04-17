import { AppwriteException } from "node-appwrite";

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

export async function GET(request: Request) {
  try {
    return withAdminRouteAuth(
      request,
      async (_, auth) => {
        const actor = getAdminAuditActor(auth);

        try {
          const account = createAdminSessionAccount(auth.sessionSecret);
          const recoveryCodes = await account.getMFARecoveryCodes();

          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.recovery_codes.read",
            resourceType: "mfa",
            status: "success",
          });

          return success({ recoveryCodes: recoveryCodes.recoveryCodes });
        } catch (error) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.recovery_codes.read",
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
            if (error.code === 401 || error.code === 403) {
              return failure("MFA challenge required to view recovery codes.", 403);
            }

            return failure(
              error.message || "Unable to load recovery codes.",
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
      action: "admin.mfa.recovery_codes.read",
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
