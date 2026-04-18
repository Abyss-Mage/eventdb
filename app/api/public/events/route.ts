import { publicEventDiscoveryQuerySchema } from "@/lib/domain/schemas";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { listEvents } from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsedQuery = publicEventDiscoveryQuerySchema.safeParse({
    game: requestUrl.searchParams.get("game") ?? undefined,
    region: requestUrl.searchParams.get("region") ?? undefined,
    format: requestUrl.searchParams.get("format") ?? undefined,
    minEntryFeeMinor: requestUrl.searchParams.get("minEntryFeeMinor") ?? undefined,
    maxEntryFeeMinor: requestUrl.searchParams.get("maxEntryFeeMinor") ?? undefined,
    limit: requestUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    const issue = parsedQuery.error.issues.at(0);
    return failure(issue?.message ?? "Invalid event discovery query.", 400);
  }

  try {
    const { game, region, format, minEntryFeeMinor, maxEntryFeeMinor, limit } =
      parsedQuery.data;
    const events = await listEvents({
      game,
      region,
      format,
      visibility: "public",
      limit: limit ?? 100,
    });
    const filteredEvents = events
      .filter((event) => event.status !== "draft" && event.status !== "archived")
      .filter((event) => {
        if (minEntryFeeMinor === undefined) {
          return true;
        }
        return (event.entryFeeMinor ?? 0) >= minEntryFeeMinor;
      })
      .filter((event) => {
        if (maxEntryFeeMinor === undefined) {
          return true;
        }
        return (event.entryFeeMinor ?? 0) <= maxEntryFeeMinor;
      })
      .sort(
        (left, right) =>
          new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      )
      .slice(0, limit ?? 100);

    return success({ events: filteredEvents });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
