import { riotSyncPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { syncRiotEventData } from "@/services/riot-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest, auth) => {
    const actor = getAdminAuditActor(auth);

    let payload: unknown;

    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.riot.sync",
        resourceType: "riot_sync",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = riotSyncPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.riot.sync",
        resourceType: "riot_sync",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid Riot sync payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid Riot sync payload.", 400);
    }

    const { eventId, matchIds, playerIds, maxMatchesPerPlayer } = parsed.data;

    try {
      const sync = await syncRiotEventData(eventId, {
        matchIds,
        playerIds,
        maxMatchesPerPlayer,
      });
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.riot.sync",
        resourceType: "riot_sync",
        eventId: sync.eventId,
        status: "success",
        details: {
          requestedMatchCount: sync.requestedMatchCount,
          processedMatchCount: sync.processedMatchCount,
          upsertedMatches: sync.upsertedMatches,
          upsertedPlayerStats: sync.upsertedPlayerStats,
          skippedMatchCount: sync.skippedMatchCount,
          warningsCount: sync.warnings.length,
        },
      });
      return success({ sync });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.riot.sync",
        resourceType: "riot_sync",
        eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          matchIdsCount: matchIds?.length ?? 0,
          playerIdsCount: playerIds?.length ?? 0,
          maxMatchesPerPlayer,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
