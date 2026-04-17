import { createMatchPayloadSchema, matchStatusValueSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import type { MatchStatus } from "@/lib/domain/types";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import {
  createMatch,
  listMatchesByEvent,
  recomputeStandingsForEvent,
} from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const eventIdParam = requestUrl.searchParams.get("eventId");
    const statusParam = requestUrl.searchParams.get("status");
    const limitParam = requestUrl.searchParams.get("limit");

    if (!eventIdParam || eventIdParam.trim().length === 0) {
      return failure("eventId query parameter is required.", 400);
    }

    const eventId = eventIdParam.trim();

    let status: MatchStatus | undefined;
    if (statusParam !== null) {
      const parsedStatus = matchStatusValueSchema.safeParse(statusParam);
      if (!parsedStatus.success) {
        return failure("Invalid status query parameter.", 400);
      }

      status = parsedStatus.data;
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
      const matches = await listMatchesByEvent(eventId, { status, limit });
      return success({ matches });
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
        action: "admin.match.create",
        resourceType: "match",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = createMatchPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.create",
        resourceType: "match",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid match payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid match payload.", 400);
    }

    try {
      const match = await createMatch(parsed.data);
      await recomputeStandingsForEvent(match.eventId);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.create",
        resourceType: "match",
        resourceId: match.id,
        eventId: match.eventId,
        status: "success",
        details: {
          status: match.status,
          standingsRecomputed: true,
        },
      });
      return success({ match }, parsed.data.id ? 200 : 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.match.create",
        resourceType: "match",
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
