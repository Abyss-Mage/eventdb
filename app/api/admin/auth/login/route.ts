import { AppwriteException } from "node-appwrite";

import {
  createAdminEmailPasswordSession,
  MissingAdminSessionSecretError,
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

type LoginFailureClassification = {
  message: string;
  status: number;
  reason:
    | "invalid_credentials"
    | "rate_limited"
    | "auth_method_disabled"
    | "appwrite_config_error"
    | "appwrite_unauthorized"
    | "appwrite_auth_error";
};

function classifyAppwriteLoginError(
  error: AppwriteException,
): LoginFailureClassification {
  const errorTypeRaw = String(error.type ?? "").toLowerCase();
  const errorMessageRaw = String(error.message ?? "").toLowerCase();
  const errorType = errorTypeRaw.replaceAll("_", " ").replaceAll("-", " ");
  const errorMessage = errorMessageRaw.replaceAll("_", " ").replaceAll("-", " ");
  const combined = `${errorTypeRaw} ${errorMessageRaw} ${errorType} ${errorMessage}`;

  const hasAny = (...patterns: string[]) => {
    return patterns.some((pattern) => {
      const normalizedPattern = pattern.toLowerCase();
      const friendlyPattern = normalizedPattern
        .replaceAll("_", " ")
        .replaceAll("-", " ");
      return (
        combined.includes(normalizedPattern) || combined.includes(friendlyPattern)
      );
    });
  };
  const hasAllInCombined = (...patterns: string[]) =>
    patterns.every((pattern) => hasAny(pattern));
  const errorTypeDetail =
    errorTypeRaw.length > 0 ? ` (Appwrite type: ${errorTypeRaw})` : "";

  if (error.code === 429 || hasAny("rate limit", "too many requests")) {
    return {
      message: "Too many login attempts. Please try again later.",
      status: 429,
      reason: "rate_limited",
    };
  }

  if (
    hasAny(
      "user_invalid_credentials",
      "invalid credentials",
      "invalid email or password",
      "password is invalid",
      "password is incorrect",
    )
  ) {
    return {
      message: "Invalid email or password.",
      status: 401,
      reason: "invalid_credentials",
    };
  }

  if (
    hasAny("user_auth_method_unsupported") ||
    hasAllInCombined("auth", "method", "disabled") ||
    hasAllInCombined("email/password", "disabled") ||
    hasAllInCombined("email password", "disabled") ||
    hasAllInCombined("email/password", "not enabled") ||
    hasAllInCombined("email password", "not enabled")
  ) {
    return {
      message:
        "Email/password login is disabled in Appwrite. Enable it in Auth settings and try again.",
      status: 503,
      reason: "auth_method_disabled",
    };
  }

  if (
    hasAny(
      "missing scope",
      "unauthorized scope",
      "general_unauthorized_scope",
      "api key",
      "project not found",
      "project id",
      "invalid endpoint",
      "permission",
    )
  ) {
    return {
      message:
        `Appwrite server configuration error${errorTypeDetail}. Check endpoint/project ID and ensure APPWRITE_API_KEY has users.read, users.write, databases.read, and databases.write scopes.`,
      status: 500,
      reason: "appwrite_config_error",
    };
  }

  if (error.code === 401) {
    return {
      message:
        `Appwrite rejected this login request as unauthorized${errorTypeDetail}. If credentials are correct, verify Email/Password auth is enabled and APPWRITE_API_KEY includes users.read + users.write scopes in this same project.`,
      status: 401,
      reason: "appwrite_unauthorized",
    };
  }

  return {
    message: "Unable to sign in due to an Appwrite authentication error.",
    status: error.code >= 400 && error.code < 600 ? error.code : 500,
    reason: "appwrite_auth_error",
  };
}

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
    if (error instanceof MissingAdminSessionSecretError) {
      await writeAdminAuditLogBestEffort({
        actorUserId: "anonymous",
        actorEmail: attemptedEmail,
        action: "admin.login",
        resourceType: "admin_session",
        status: "failure",
        details: {
          reason: "missing_session_secret",
          errorMessage: error.message,
        },
      });
      return failure(
        "Appwrite session secret was not returned. Check Appwrite API key setup and login configuration.",
        500,
      );
    }

    if (error instanceof AppwriteException) {
      const classification = classifyAppwriteLoginError(error);
      await writeAdminAuditLogBestEffort({
        actorUserId: "anonymous",
        actorEmail: attemptedEmail,
        action: "admin.login",
        resourceType: "admin_session",
        status: "failure",
        details: {
          reason: classification.reason,
          appwriteCode: error.code,
          appwriteType: error.type,
          appwriteMessage: error.message,
        },
      });
      return failure(classification.message, classification.status);
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
