import { adminAssignSoloPlayersSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { assignSoloPlayersToExistingTeam } from "@/services/registrations";

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
        action: "admin.team.assign_solo",
        resourceType: "team",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminAssignSoloPlayersSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.assign_solo",
        resourceType: "team",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid solo assignment payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid solo assignment payload.", 400);
    }

    try {
      const summary = await assignSoloPlayersToExistingTeam(
        parsed.data.eventId,
        parsed.data.teamId,
        parsed.data.soloPlayerIds,
      );
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.assign_solo",
        resourceType: "team",
        resourceId: parsed.data.teamId,
        eventId: parsed.data.eventId,
        status: "success",
        details: {
          assignedCount: summary.assignedCount,
          resultingPlayerCount: summary.resultingPlayerCount,
          selectedCount: parsed.data.soloPlayerIds.length,
        },
      });

      return success({ summary });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.assign_solo",
        resourceType: "team",
        resourceId: parsed.data.teamId,
        eventId: parsed.data.eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          selectedCount: parsed.data.soloPlayerIds.length,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
