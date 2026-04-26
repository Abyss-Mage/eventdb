import { adminFreeAgentRemoveSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { removeFreeAgent } from "@/services/registrations";

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
        action: "admin.free_agent.remove",
        resourceType: "free_agent",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminFreeAgentRemoveSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.remove",
        resourceType: "free_agent",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid solo player remove payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid solo player remove payload.", 400);
    }

    try {
      const summary = await removeFreeAgent(parsed.data.eventId, parsed.data.freeAgentId);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.remove",
        resourceType: "free_agent",
        resourceId: summary.freeAgentId,
        eventId: summary.eventId,
        status: "success",
      });
      return success({ summary });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.free_agent.remove",
        resourceType: "free_agent",
        resourceId: parsed.data.freeAgentId,
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
