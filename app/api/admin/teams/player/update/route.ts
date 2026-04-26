import { adminTeamPlayerUpdateSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { updateTeamPlayer } from "@/services/registrations";

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
        action: "admin.team.player.update",
        resourceType: "team_player",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminTeamPlayerUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.update",
        resourceType: "team_player",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError:
            firstIssue?.message ?? "Invalid team player update payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid team player update payload.", 400);
    }

    const { eventId, teamId, playerId, ...updatesInput } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(updatesInput).filter(([, value]) => value !== undefined),
    );

    try {
      const player = await updateTeamPlayer(eventId, teamId, playerId, updates);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.update",
        resourceType: "team_player",
        resourceId: player.id,
        eventId: player.eventId,
        status: "success",
        details: { updatedFields: Object.keys(updates), teamId },
      });
      return success({ player });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.update",
        resourceType: "team_player",
        resourceId: playerId,
        eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          updatedFields: Object.keys(updates),
          teamId,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}

