import { AppwriteException, AuthenticatorType } from "node-appwrite";

import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import {
  createAdminSessionAccount,
  getAdminAuthSession,
} from "@/lib/appwrite/auth-session";
import { adminMfaEnrollmentVerifySchema } from "@/lib/domain/schemas";
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

async function createOrReadRecoveryCodes(account: ReturnType<typeof createAdminSessionAccount>) {
  try {
    const generated = await account.createMFARecoveryCodes();
    return generated.recoveryCodes;
  } catch (error) {
    if (
      error instanceof AppwriteException &&
      (error.code === 400 || error.code === 409 || error.code === 412)
    ) {
      const existing = await account.getMFARecoveryCodes();
      return existing.recoveryCodes;
    }

    throw error;
  }
}

export async function POST(request: Request) {
  try {
    return withAdminRouteAuth(
      request,
      async (authedRequest, auth) => {
        const actor = getAdminAuditActor(auth);

        let payload: unknown;

        try {
          payload = await authedRequest.json();
        } catch {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.verify",
            resourceType: "mfa",
            status: "failure",
            details: { reason: "invalid_json_payload" },
          });
          return failure("Invalid JSON payload.", 400);
        }

        const parsed = adminMfaEnrollmentVerifySchema.safeParse(payload);
        if (!parsed.success) {
          const firstIssue = parsed.error.issues.at(0);
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.verify",
            resourceType: "mfa",
            status: "failure",
            details: {
              reason: "invalid_payload",
              validationError:
                firstIssue?.message ?? "Invalid MFA enrollment payload.",
            },
          });
          return failure(firstIssue?.message ?? "Invalid MFA enrollment payload.", 400);
        }

        try {
          const account = createAdminSessionAccount(auth.sessionSecret);
          await account.updateMFAAuthenticator({
            type: AuthenticatorType.Totp,
            otp: parsed.data.otp,
          });

          if (!auth.mfa.mfaEnabled) {
            await account.updateMFA({ mfa: true });
          }

          const recoveryCodes = await createOrReadRecoveryCodes(account);
          const refreshedAuth = await getAdminAuthSession();
          if (!refreshedAuth) {
            await writeAdminAuditLogBestEffort({
              ...actor,
              action: "admin.mfa.enroll.verify",
              resourceType: "mfa",
              status: "failure",
              details: { reason: "authentication_required_after_enroll" },
            });
            return failure("Authentication required.", 401);
          }

          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.verify",
            resourceType: "mfa",
            status: "success",
            details: {
              mfaEnabled: refreshedAuth.mfa.mfaEnabled,
              setupRequired: refreshedAuth.mfa.setupRequired,
              challengeRequired: refreshedAuth.mfa.challengeRequired,
            },
          });

          return success({
            verified: true as const,
            recoveryCodes,
            mfa: {
              required: refreshedAuth.mfa.required,
              verified: refreshedAuth.mfa.verified,
              totpEnrolled: refreshedAuth.mfa.totpEnrolled,
              setupRequired: refreshedAuth.mfa.setupRequired,
              challengeRequired: refreshedAuth.mfa.challengeRequired,
              mfaEnabled: refreshedAuth.mfa.mfaEnabled,
            },
          });
        } catch (error) {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.enroll.verify",
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
              error.message || "Unable to verify TOTP authenticator.",
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
      action: "admin.mfa.enroll.verify",
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
