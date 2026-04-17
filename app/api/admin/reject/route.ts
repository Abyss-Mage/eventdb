import { rejectRegistrationSchema } from "@/lib/domain/schemas";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { rejectRegistration } from "@/services/registrations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return failure("Invalid JSON payload.", 400);
  }

  const parsed = rejectRegistrationSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    return failure(firstIssue?.message ?? "Invalid reject payload.", 400);
  }

  try {
    await rejectRegistration(parsed.data.registrationId, parsed.data.reason);
    return success({ registrationId: parsed.data.registrationId, status: "rejected" as const });
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
