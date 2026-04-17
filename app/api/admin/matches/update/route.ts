import { updateMatchPayloadSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import {
  type UpdateMatchInput,
  recomputeStandingsForEvent,
  updateMatch,
} from "@/services/event-domain";

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
        action: "admin.match.update",
        resourceType: "match",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = updateMatchPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.update",
        resourceType: "match",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid match update payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid match update payload.", 400);
    }

    const { matchId, ...updatesInput } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(updatesInput).filter(([, value]) => value !== undefined),
    ) as UpdateMatchInput;

    try {
      const match = await updateMatch(matchId, updates);
      await recomputeStandingsForEvent(match.eventId);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.update",
        resourceType: "match",
        resourceId: match.id,
        eventId: match.eventId,
        status: "success",
        details: {
          updatedFields: Object.keys(updates),
          standingsRecomputed: true,
        },
      });
      return success({ match });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.update",
        resourceType: "match",
        resourceId: matchId,
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
