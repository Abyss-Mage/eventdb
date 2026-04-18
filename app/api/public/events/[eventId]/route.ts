import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { getEventById } from "@/services/event-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  void request;

  const { eventId } = await context.params;
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return failure("Event ID is required.", 400);
  }

  try {
    const event = await getEventById(normalizedEventId);
    if (!event) {
      return failure("Event not found.", 404);
    }

    if (event.status === "draft" || event.status === "archived") {
      return failure("Event not found.", 404);
    }

    if (event.visibility === "private") {
      return failure("Event not found.", 404);
    }

    return success({ event });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
