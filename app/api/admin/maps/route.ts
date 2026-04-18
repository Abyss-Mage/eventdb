import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { listMaps } from "@/services/maps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseActiveOnly(value: string | null): boolean | null {
  if (value === null) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const activeOnly = parseActiveOnly(requestUrl.searchParams.get("activeOnly"));
    if (activeOnly === null) {
      return failure("activeOnly query parameter must be true or false.", 400);
    }

    const limitParam = requestUrl.searchParams.get("limit");
    let limit: number | undefined;

    if (limitParam !== null) {
      const parsedLimit = Number(limitParam);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
        return failure("Limit must be an integer between 1 and 200.", 400);
      }
      limit = parsedLimit;
    }

    try {
      const maps = await listMaps({ activeOnly, limit });
      return success({ maps });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
