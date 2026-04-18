import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getEventById,
  listTeamStandingsByEvent,
  type StandingsSortKey,
} from "@/services/event-domain";
import { parseLimit, resolveLatestActiveEvent } from "@/app/api/public/shared";

const STANDINGS_SORT_KEYS = new Set<StandingsSortKey>([
  "wins",
  "roundDiff",
  "points",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const eventIdParam = requestUrl.searchParams.get("eventId")?.trim();
  const sortByParam = requestUrl.searchParams.get("sortBy");

  let sortBy: StandingsSortKey | undefined;
  if (sortByParam !== null) {
    if (!STANDINGS_SORT_KEYS.has(sortByParam as StandingsSortKey)) {
      return failure("Invalid sortBy query parameter.", 400);
    }

    sortBy = sortByParam as StandingsSortKey;
  }

  try {
    const limit = parseLimit(requestUrl.searchParams.get("limit"), {
      defaultValue: 50,
      max: 100,
    });
    const event =
      eventIdParam && eventIdParam.length > 0
        ? await getEventById(eventIdParam)
        : await resolveLatestActiveEvent();

    if (!event) {
      return success({ event: null, standings: [] });
    }

    const standings = await listTeamStandingsByEvent(event.id, { limit, sortBy });
    return success({ event, standings });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
