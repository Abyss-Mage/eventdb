import { AppwriteException } from "node-appwrite";

import {
  createAdminEmailPasswordSession,
  revokeAdminSession,
  setAdminSessionCookie,
} from "@/lib/appwrite/auth-session";
import { isAdminAuthSession } from "@/lib/appwrite/admin-role";
import { adminLoginSchema } from "@/lib/domain/schemas";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  let attemptedEmail: string | undefined;

  try {
    payload = await request.json();
  } catch {
    await writeAdminAuditLogBestEffort({
      actorUserId: "anonymous",
      action: "admin.login",
      resourceType: "admin_session",
      status: "failure",
      details: { reason: "invalid_json_payload" },
    });
    return failure("Invalid JSON payload.", 400);
  }

  if (typeof payload === "object" && payload !== null) {
    const payloadEmail = (payload as { email?: unknown }).email;
    if (typeof payloadEmail === "string") {
      const normalized = payloadEmail.trim().toLowerCase();
      if (normalized) {
        attemptedEmail = normalized;
      }
    }
  }

  const parsed = adminLoginSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    await writeAdminAuditLogBestEffort({
      actorUserId: "anonymous",
      actorEmail: attemptedEmail,
      action: "admin.login",
      resourceType: "admin_session",
      status: "failure",
      details: {
        reason: "invalid_payload",
        validationError: firstIssue?.message ?? "Invalid login payload.",
      },
    });
    return failure(firstIssue?.message ?? "Invalid login payload.", 400);
  }

  attemptedEmail = parsed.data.email;

  try {
    const auth = await createAdminEmailPasswordSession(
      parsed.data.email,
      parsed.data.password,
    );

    const isAdmin = await isAdminAuthSession(auth);
    if (!isAdmin) {
      await revokeAdminSession(auth.sessionSecret);
      await writeAdminAuditLogBestEffort({
        ...getAdminAuditActor(auth),
        action: "admin.login",
        resourceType: "admin_session",
        status: "failure",
        details: { reason: "admin_access_required" },
      });
      return failure("Admin access required.", 403);
    }

    const nextStep = auth.mfa.setupRequired
      ? ("setup_totp" as const)
      : auth.mfa.challengeRequired
        ? ("verify_totp" as const)
        : ("complete" as const);

    const response = success({
      user: {
        id: auth.user.$id,
        email: auth.user.email,
        name: auth.user.name,
      },
      session: {
        id: auth.session.$id,
        expire: auth.session.expire,
        factors: auth.session.factors,
      },
      mfa: {
        required: auth.mfa.required,
        verified: auth.mfa.verified,
        totpEnrolled: auth.mfa.totpEnrolled,
        setupRequired: auth.mfa.setupRequired,
        challengeRequired: auth.mfa.challengeRequired,
        mfaEnabled: auth.mfa.mfaEnabled,
      },
      nextStep,
    });

    await writeAdminAuditLogBestEffort({
      ...getAdminAuditActor(auth),
      action: "admin.login",
      resourceType: "admin_session",
      status: "success",
      details: {
        nextStep,
        mfa: {
          setupRequired: auth.mfa.setupRequired,
          challengeRequired: auth.mfa.challengeRequired,
          verified: auth.mfa.verified,
        },
      },
    });

    setAdminSessionCookie(response, auth.sessionSecret, auth.session.expire);
    return response;
  } catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 400 || error.code === 401) {
        await writeAdminAuditLogBestEffort({
          actorUserId: "anonymous",
          actorEmail: attemptedEmail,
          action: "admin.login",
          resourceType: "admin_session",
          status: "failure",
          details: { reason: "invalid_credentials" },
        });
        return failure("Invalid email or password.", 401);
      }

      if (error.code === 429) {
        await writeAdminAuditLogBestEffort({
          actorUserId: "anonymous",
          actorEmail: attemptedEmail,
          action: "admin.login",
          resourceType: "admin_session",
          status: "failure",
          details: { reason: "rate_limited" },
        });
        return failure("Too many login attempts. Please try again later.", 429);
      }
    }

    await writeAdminAuditLogBestEffort({
      actorUserId: "anonymous",
      actorEmail: attemptedEmail,
      action: "admin.login",
      resourceType: "admin_session",
      status: "failure",
      details: {
        reason: "unexpected_error",
        errorMessage: getErrorMessage(error),
      },
    });
    return failure(getErrorMessage(error), 500);
  }
}
