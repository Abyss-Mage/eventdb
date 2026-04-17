import { updateEventPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { type UpdateEventInput, updateEvent } from "@/services/event-domain";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest, auth) => {
    const actor = getAdminAuditActor(auth);

    let payload: unknown;

    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.update",
        resourceType: "event",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = updateEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.update",
        resourceType: "event",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid event update payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid event update payload.", 400);
    }

    const { eventId, ...updatesInput } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(updatesInput).filter(([, value]) => value !== undefined),
    ) as UpdateEventInput;

    try {
      const event = await updateEvent(eventId, updates);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.update",
        resourceType: "event",
        resourceId: event.id,
        eventId: event.id,
        status: "success",
        details: { updatedFields: Object.keys(updates) },
      });
      return success({ event });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.update",
        resourceType: "event",
        resourceId: eventId,
        eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          updatedFields: Object.keys(updates),
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
