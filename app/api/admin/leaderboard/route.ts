import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  type StandingsSortKey,
  listTeamStandingsByEvent,
} from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STANDINGS_SORT_KEYS = new Set<StandingsSortKey>([
  "wins",
  "roundDiff",
  "points",
]);

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const eventIdParam = requestUrl.searchParams.get("eventId");
    const limitParam = requestUrl.searchParams.get("limit");
    const sortByParam = requestUrl.searchParams.get("sortBy");

    if (!eventIdParam || eventIdParam.trim().length === 0) {
      return failure("eventId query parameter is required.", 400);
    }

    let limit: number | undefined;
    if (limitParam !== null) {
      const parsedLimit = Number(limitParam);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return failure("Limit must be an integer between 1 and 100.", 400);
      }

      limit = parsedLimit;
    }

    let sortBy: StandingsSortKey | undefined;
    if (sortByParam !== null) {
      if (!STANDINGS_SORT_KEYS.has(sortByParam as StandingsSortKey)) {
        return failure("Invalid sortBy query parameter.", 400);
      }

      sortBy = sortByParam as StandingsSortKey;
    }

    try {
      const standings = await listTeamStandingsByEvent(eventIdParam, { limit, sortBy });
      return success({ standings });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
