import {
  clearAdminSessionCookie,
  getAdminAuthSession,
  revokeAdminSession,
} from "@/lib/appwrite/auth-session";
import { isAdminAuthSession } from "@/lib/appwrite/admin-role";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  let auditActorUserId = "anonymous";
  let auditActorEmail: string | undefined;

  try {
    const auth = await getAdminAuthSession();

    if (!auth) {
      await writeAdminAuditLogBestEffort({
        actorUserId: auditActorUserId,
        action: "admin.logout",
        resourceType: "admin_session",
        status: "failure",
        details: { reason: "authentication_required" },
      });
      return failure("Authentication required.", 401);
    }

    const actor = getAdminAuditActor(auth);
    auditActorUserId = actor.actorUserId;
    auditActorEmail = actor.actorEmail;

    const isAdmin = await isAdminAuthSession(auth);
    if (!isAdmin) {
      await revokeAdminSession(auth.sessionSecret);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.logout",
        resourceType: "admin_session",
        status: "failure",
        details: { reason: "admin_access_required" },
      });
      const response = failure("Admin access required.", 403);
      clearAdminSessionCookie(response);
      return response;
    }

    await revokeAdminSession(auth.sessionSecret);
    await writeAdminAuditLogBestEffort({
      ...actor,
      action: "admin.logout",
      resourceType: "admin_session",
      status: "success",
    });
    const response = success({ loggedOut: true as const });
    clearAdminSessionCookie(response);

    return response;
  } catch (error) {
    await writeAdminAuditLogBestEffort({
      actorUserId: auditActorUserId,
      actorEmail: auditActorEmail,
      action: "admin.logout",
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
