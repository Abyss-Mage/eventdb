import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { getEventById, getMvpSummaryByEvent } from "@/services/event-domain";
import { parseLimit, resolveLatestActiveEvent } from "@/app/api/public/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const eventIdParam = requestUrl.searchParams.get("eventId")?.trim();

  try {
    const limit = parseLimit(requestUrl.searchParams.get("limit"), {
      defaultValue: 25,
      max: 100,
    });
    const event =
      eventIdParam && eventIdParam.length > 0
        ? await getEventById(eventIdParam)
        : await resolveLatestActiveEvent();

    if (!event) {
      return success({ event: null, summary: null, candidates: [] });
    }

    const summary = await getMvpSummaryByEvent(event.id);
    return success({
      event,
      summary,
      candidates: (summary?.candidates ?? []).slice(0, limit),
    });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
