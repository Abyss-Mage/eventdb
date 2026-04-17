import { createPlayerStatPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { createPlayerStat, listPlayerStatsByEvent } from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const eventIdParam = requestUrl.searchParams.get("eventId");
    const teamIdParam = requestUrl.searchParams.get("teamId");
    const playerIdParam = requestUrl.searchParams.get("playerId");
    const limitParam = requestUrl.searchParams.get("limit");

    if (!eventIdParam || eventIdParam.trim().length === 0) {
      return failure("eventId query parameter is required.", 400);
    }

    const eventId = eventIdParam.trim();
    const teamId = teamIdParam?.trim();
    const playerId = playerIdParam?.trim();

    if (teamIdParam !== null && !teamId) {
      return failure("teamId query parameter cannot be empty.", 400);
    }

    if (playerIdParam !== null && !playerId) {
      return failure("playerId query parameter cannot be empty.", 400);
    }

    let limit: number | undefined;
    if (limitParam !== null) {
      const parsedLimit = Number(limitParam);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return failure("Limit must be an integer between 1 and 100.", 400);
      }

      limit = parsedLimit;
    }

    try {
      const playerStats = await listPlayerStatsByEvent(eventId, {
        limit,
        playerId,
        teamId,
      });
      return success({ playerStats });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest, auth) => {
    const actor = getAdminAuditActor(auth);

    let payload: unknown;

    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.create",
        resourceType: "player_stat",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = createPlayerStatPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.create",
        resourceType: "player_stat",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid player stat payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid player stat payload.", 400);
    }

    try {
      const playerStat = await createPlayerStat(parsed.data);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.create",
        resourceType: "player_stat",
        resourceId: playerStat.id,
        eventId: playerStat.eventId,
        status: "success",
      });
      return success({ playerStat }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.player_stat.create",
        resourceType: "player_stat",
        resourceId: parsed.data.id,
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
