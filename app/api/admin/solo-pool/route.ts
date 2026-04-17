import { adminEventScopedQuerySchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { listSoloPlayersByEvent } from "@/services/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const parsed = adminEventScopedQuerySchema.safeParse({
      eventId: requestUrl.searchParams.get("eventId"),
      limit: requestUrl.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      return failure(firstIssue?.message ?? "Invalid query parameters.", 400);
    }

    try {
      const soloPlayers = await listSoloPlayersByEvent(parsed.data.eventId, {
        status: "available",
        limit: parsed.data.limit ?? 100,
      });
      return success({ soloPlayers });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
