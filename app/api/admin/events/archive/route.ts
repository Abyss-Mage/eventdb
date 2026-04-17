import { eventTransitionPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { archiveEvent } from "@/services/event-domain";

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
        action: "admin.event.archive",
        resourceType: "event",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = eventTransitionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.archive",
        resourceType: "event",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid archive payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid archive payload.", 400);
    }

    try {
      const event = await archiveEvent(parsed.data.eventId);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.archive",
        resourceType: "event",
        resourceId: event.id,
        eventId: event.id,
        status: "success",
        details: { status: event.status },
      });
      return success({ event });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.archive",
        resourceType: "event",
        resourceId: parsed.data.eventId,
        eventId: parsed.data.eventId,
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
