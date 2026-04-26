import { adminTeamPlayerRemoveSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { removeTeamPlayer } from "@/services/registrations";

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
        action: "admin.team.player.remove",
        resourceType: "team_player",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminTeamPlayerRemoveSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.remove",
        resourceType: "team_player",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid team player remove payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid team player remove payload.", 400);
    }

    try {
      const summary = await removeTeamPlayer(
        parsed.data.eventId,
        parsed.data.teamId,
        parsed.data.playerId,
      );
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.remove",
        resourceType: "team_player",
        resourceId: summary.playerId,
        eventId: summary.eventId,
        status: "success",
        details: {
          teamId: summary.teamId,
          resultingPlayerCount: summary.resultingPlayerCount,
        },
      });
      return success({ summary });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.remove",
        resourceType: "team_player",
        resourceId: parsed.data.playerId,
        eventId: parsed.data.eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          teamId: parsed.data.teamId,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}

