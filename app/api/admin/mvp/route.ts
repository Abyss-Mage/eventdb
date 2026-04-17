import { adminMvpQuerySchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { getMvpSummaryByEvent } from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const parsedQuery = adminMvpQuerySchema.safeParse({
      eventId: requestUrl.searchParams.get("eventId") ?? "",
    });

    if (!parsedQuery.success) {
      const firstIssue = parsedQuery.error.issues.at(0);
      return failure(firstIssue?.message ?? "Invalid MVP query payload.", 400);
    }

    try {
      const summary = await getMvpSummaryByEvent(parsedQuery.data.eventId);
      return success({ summary });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
