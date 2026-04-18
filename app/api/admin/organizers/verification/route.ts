import { updateOrganizerVerificationPayloadSchema } from "@/lib/domain/schemas";
import { withAdminActorRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { updateOrganizerVerification } from "@/services/organizers";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  return withAdminActorRouteAuth(request, async (authedRequest, auth, actor) => {
    const auditActor = getAdminAuditActor(auth);

    let payload: unknown;
    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.verification.update",
        resourceType: "organizer",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = updateOrganizerVerificationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.verification.update",
        resourceType: "organizer",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError:
            issue?.message ?? "Invalid organizer verification update payload.",
        },
      });
      return failure(
        issue?.message ?? "Invalid organizer verification update payload.",
        400,
      );
    }

    const { organizerId, verificationStatus, verificationBadge, isActive } = parsed.data;

    try {
      const organizer = await updateOrganizerVerification(organizerId, {
        verificationStatus,
        verificationBadge,
        isActive,
      });
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.verification.update",
        resourceType: "organizer",
        resourceId: organizer.id,
        status: "success",
        details: {
          verificationStatus: organizer.verificationStatus,
          verificationBadge: organizer.verificationBadge,
          isActive: organizer.isActive,
          actorRoles: actor.roles,
        },
      });
      return success({ organizer });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.verification.update",
        resourceType: "organizer",
        resourceId: organizerId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
