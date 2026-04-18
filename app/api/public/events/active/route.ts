import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { resolveLatestActiveEvent } from "@/app/api/public/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const event = await resolveLatestActiveEvent();
    return success({ event });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
