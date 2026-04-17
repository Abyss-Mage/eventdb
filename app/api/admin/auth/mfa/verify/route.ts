import { AppwriteException } from "node-appwrite";

import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import {
  createAdminSessionAccount,
  getAdminAuthSession,
} from "@/lib/appwrite/auth-session";
import { adminMfaChallengeVerifySchema } from "@/lib/domain/schemas";
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
      async (authedRequest, auth) => {
        const actor = getAdminAuditActor(auth);

        let payload: unknown;

        try {
          payload = await authedRequest.json();
        } catch {
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.verify",
            resourceType: "mfa",
            status: "failure",
            details: { reason: "invalid_json_payload" },
          });
          return failure("Invalid JSON payload.", 400);
        }

        const parsed = adminMfaChallengeVerifySchema.safeParse(payload);
        if (!parsed.success) {
          const firstIssue = parsed.error.issues.at(0);
          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.verify",
            resourceType: "mfa",
            status: "failure",
            details: {
              reason: "invalid_payload",
              validationError:
                firstIssue?.message ?? "Invalid MFA verification payload.",
            },
          });
          return failure(firstIssue?.message ?? "Invalid MFA verification payload.", 400);
        }

        try {
          const account = createAdminSessionAccount(auth.sessionSecret);
          const session = await account.updateMFAChallenge({
            challengeId: parsed.data.challengeId,
            otp: parsed.data.otp,
          });
          const refreshedAuth = await getAdminAuthSession();

          if (!refreshedAuth) {
            await writeAdminAuditLogBestEffort({
              ...actor,
              action: "admin.mfa.challenge.verify",
              resourceType: "mfa",
              resourceId: parsed.data.challengeId,
              status: "failure",
              details: { reason: "authentication_required_after_verify" },
            });
            return failure("Authentication required.", 401);
          }

          await writeAdminAuditLogBestEffort({
            ...actor,
            action: "admin.mfa.challenge.verify",
            resourceType: "mfa",
            resourceId: parsed.data.challengeId,
            status: "success",
            details: {
              verified: refreshedAuth.mfa.verified,
              challengeRequired: refreshedAuth.mfa.challengeRequired,
            },
          });

          return success({
            verified: true as const,
            session: {
              id: session.$id,
              expire: session.expire,
              factors: session.factors,
              mfaUpdatedAt: session.mfaUpdatedAt,
            },
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
            action: "admin.mfa.challenge.verify",
            resourceType: "mfa",
            resourceId:
              typeof payload === "object" &&
              payload !== null &&
              typeof (payload as { challengeId?: unknown }).challengeId === "string"
                ? (payload as { challengeId: string }).challengeId
                : undefined,
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
              error.message || "Unable to verify MFA challenge.",
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
      action: "admin.mfa.challenge.verify",
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
