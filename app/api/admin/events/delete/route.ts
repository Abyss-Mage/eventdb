import { deleteEventPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { deleteArchivedEventWithCascade } from "@/services/event-domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest, auth) => {
    const actor = getAdminAuditActor(auth);

    let payload: unknown;

    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.delete",
        resourceType: "event",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = deleteEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.delete",
        resourceType: "event",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid event delete payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid event delete payload.", 400);
    }

    const { eventId, confirmationCode } = parsed.data;

    try {
      const deleted = await deleteArchivedEventWithCascade(eventId, confirmationCode);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.delete",
        resourceType: "event",
        resourceId: deleted.eventId,
        eventId: deleted.eventId,
        status: "success",
        details: {
          eventCode: deleted.eventCode,
          eventName: deleted.eventName,
          deletedCounts: deleted.deletedCounts,
        },
      });
      return success({ deleted });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.delete",
        resourceType: "event",
        resourceId: eventId,
        eventId,
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
