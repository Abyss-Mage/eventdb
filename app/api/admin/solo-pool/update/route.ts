import { adminFreeAgentUpdateSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { updateFreeAgent } from "@/services/registrations";

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
        action: "admin.free_agent.update",
        resourceType: "free_agent",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminFreeAgentUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.update",
        resourceType: "free_agent",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid solo player update payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid solo player update payload.", 400);
    }

    const { eventId, freeAgentId, ...updatesInput } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(updatesInput).filter(([, value]) => value !== undefined),
    );

    try {
      const soloPlayer = await updateFreeAgent(eventId, freeAgentId, updates);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.update",
        resourceType: "free_agent",
        resourceId: soloPlayer.id,
        eventId: soloPlayer.eventId,
        status: "success",
        details: { updatedFields: Object.keys(updates) },
      });
      return success({ soloPlayer });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.update",
        resourceType: "free_agent",
        resourceId: freeAgentId,
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

