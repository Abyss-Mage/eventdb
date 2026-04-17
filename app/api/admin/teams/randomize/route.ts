import { adminRandomTeamCreationSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { createRandomTeamsFromSoloPlayers } from "@/services/registrations";

export const runtime = "nodejs";

function extractEventIdFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const candidate = (payload as { eventId?: unknown }).eventId;
  if (typeof candidate !== "string") {
    return undefined;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : undefined;
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
        action: "admin.team.randomize",
        resourceType: "team",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminRandomTeamCreationSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.randomize",
        resourceType: "team",
        eventId: extractEventIdFromPayload(payload),
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid random team payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid random team payload.", 400);
    }

    try {
      const summary = await createRandomTeamsFromSoloPlayers(
        parsed.data.eventId,
        parsed.data.soloPlayerIds,
        parsed.data.teamSize ?? 5,
      );
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.randomize",
        resourceType: "team",
        eventId: parsed.data.eventId,
        status: "success",
        details: {
          selectedCount: parsed.data.soloPlayerIds.length,
          createdTeamCount: summary.createdTeamCount,
          createdTeamIds: summary.createdTeamIds,
          teamSize: summary.teamSize,
        },
      });

      return success({ summary }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.randomize",
        resourceType: "team",
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
