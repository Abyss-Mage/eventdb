import {
  adminBracketQuerySchema,
  adminGenerateBracketSchema,
} from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { generateBracketForEvent, listBracketsByEvent } from "@/services/brackets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const parsed = adminBracketQuerySchema.safeParse({
      eventId: requestUrl.searchParams.get("eventId"),
      limit: requestUrl.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      return failure(firstIssue?.message ?? "Invalid query parameters.", 400);
    }

    try {
      const brackets = await listBracketsByEvent(parsed.data.eventId, parsed.data.limit ?? 20);
      return success({ brackets });
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
        action: "admin.bracket.generate",
        resourceType: "bracket",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminGenerateBracketSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.bracket.generate",
        resourceType: "bracket",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid bracket generation payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid bracket generation payload.", 400);
    }

    try {
      const bracket = await generateBracketForEvent(parsed.data.eventId, auth.user.$id, {
        state: parsed.data.state ?? "draft",
      });
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.bracket.generate",
        resourceType: "bracket",
        resourceId: bracket.id,
        eventId: bracket.eventId,
        status: "success",
        details: {
          format: bracket.format,
          version: bracket.version,
          state: bracket.state,
        },
      });
      return success({ bracket }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.bracket.generate",
        resourceType: "bracket",
        eventId: parsed.data.eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          requestedState: parsed.data.state ?? "draft",
        },
      });
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }
      return failure(getErrorMessage(error), 500);
    }
  });
}
