import {
  createEventPayloadSchema,
  eventStatusValueSchema,
} from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import type { EventStatus } from "@/lib/domain/types";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { createEvent, listEvents } from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const statusParam = requestUrl.searchParams.get("status");
    const limitParam = requestUrl.searchParams.get("limit");

    let status: EventStatus | undefined;
    if (statusParam !== null) {
      const parsedStatus = eventStatusValueSchema.safeParse(statusParam);
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
      const events = await listEvents({ status, limit });
      return success({ events });
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
        action: "admin.event.create",
        resourceType: "event",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = createEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.create",
        resourceType: "event",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid event payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid event payload.", 400);
    }

    try {
      const event = await createEvent(parsed.data);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.create",
        resourceType: "event",
        resourceId: event.id,
        eventId: event.id,
        status: "success",
        details: {
          slug: event.slug,
          code: event.code,
          status: event.status,
        },
      });
      return success({ event }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.event.create",
        resourceType: "event",
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          requestedStatus: parsed.data.status ?? "draft",
          slug: parsed.data.slug,
          code: parsed.data.code,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
