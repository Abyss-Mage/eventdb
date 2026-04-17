import {
  registrationStatusSchema,
} from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { listRegistrationsByStatus } from "@/services/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const statusParam = requestUrl.searchParams.get("status") ?? "pending";
    const parsedStatus = registrationStatusSchema.safeParse(statusParam);

    if (!parsedStatus.success) {
      return failure("Invalid status query parameter.", 400);
    }

    try {
      const registrations = await listRegistrationsByStatus(parsedStatus.data);
      return success({ registrations });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
