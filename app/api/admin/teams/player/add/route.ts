import { adminTeamPlayerAddSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { addPlayerToTeam } from "@/services/registrations";

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
        action: "admin.team.player.add",
        resourceType: "team_player",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminTeamPlayerAddSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.add",
        resourceType: "team_player",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid team player add payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid team player add payload.", 400);
    }

    try {
      const summary = await addPlayerToTeam(
        parsed.data.eventId,
        parsed.data.teamId,
        {
          ...parsed.data.player,
          registrationId: parsed.data.registrationId,
        },
      );

      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.add",
        resourceType: "team_player",
        resourceId: summary.playerId,
        eventId: summary.eventId,
        status: "success",
        details: {
          teamId: summary.teamId,
          resultingPlayerCount: summary.resultingPlayerCount,
        },
      });
      return success({ summary }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.player.add",
        resourceType: "team_player",
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

