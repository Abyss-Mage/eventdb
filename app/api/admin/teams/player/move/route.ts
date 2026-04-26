import { adminTeamPlayerMoveSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { moveTeamPlayer } from "@/services/registrations";

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
        action: "admin.team.player.move",
        resourceType: "team_player",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminTeamPlayerMoveSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.move",
        resourceType: "team_player",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid player move payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid player move payload.", 400);
    }

    const destination =
      parsed.data.destinationType === "team"
        ? { type: "team" as const, teamId: parsed.data.destinationTeamId ?? "" }
        : { type: "free_agent" as const };

    try {
      const summary = await moveTeamPlayer(
        parsed.data.eventId,
        parsed.data.playerId,
        destination,
      );
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.move",
        resourceType: "team_player",
        resourceId: summary.playerId,
        eventId: summary.eventId,
        status: "success",
        details: {
          fromTeamId: summary.fromTeamId,
          toTeamId: summary.toTeamId,
          toFreeAgentId: summary.toFreeAgentId,
          destinationType: parsed.data.destinationType,
        },
      });
      return success({ summary });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.move",
        resourceType: "team_player",
        resourceId: parsed.data.playerId,
        eventId: parsed.data.eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          destinationType: parsed.data.destinationType,
          destinationTeamId: parsed.data.destinationTeamId,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}

