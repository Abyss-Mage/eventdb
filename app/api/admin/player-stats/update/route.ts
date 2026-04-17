import { updatePlayerStatPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { type UpdatePlayerStatInput, updatePlayerStat } from "@/services/event-domain";

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
        action: "admin.player_stat.update",
        resourceType: "player_stat",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = updatePlayerStatPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.update",
        resourceType: "player_stat",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError:
            firstIssue?.message ?? "Invalid player stat update payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid player stat update payload.", 400);
    }

    const { playerStatId, ...updatesInput } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(updatesInput).filter(([, value]) => value !== undefined),
    ) as UpdatePlayerStatInput;

    try {
      const playerStat = await updatePlayerStat(playerStatId, updates);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.update",
        resourceType: "player_stat",
        resourceId: playerStat.id,
        eventId: playerStat.eventId,
        status: "success",
        details: { updatedFields: Object.keys(updates) },
      });
      return success({ playerStat });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.update",
        resourceType: "player_stat",
        resourceId: playerStatId,
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
