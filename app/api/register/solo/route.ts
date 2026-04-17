import { soloRegistrationSchema } from "@/lib/domain/schemas";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { createSoloRegistration } from "@/services/registrations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return failure("Invalid JSON payload.", 400);
  }

  const parsed = soloRegistrationSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    return failure(firstIssue?.message ?? "Invalid solo registration payload.", 400);
  }

  try {
    const registrationId = await createSoloRegistration(parsed.data);
    return success({ registrationId, status: "available" as const }, 201);
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}
