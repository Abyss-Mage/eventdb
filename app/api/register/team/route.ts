import { teamRegistrationSchema } from "@/lib/domain/schemas";
import { HttpError, isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { createTeamRegistration } from "@/services/registrations";

export const runtime = "nodejs";

function validationErrorMessage(error: HttpError | unknown): string {
  if (isHttpError(error)) {
    return error.message;
  }

  return getErrorMessage(error, "Invalid request payload.");
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return failure("Invalid JSON payload.", 400);
  }

  const parsed = teamRegistrationSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    return failure(firstIssue?.message ?? "Invalid team registration payload.", 400);
  }

  try {
    const registrationId = await createTeamRegistration(parsed.data);
    return success({ registrationId, status: "pending" as const }, 201);
  } catch (error) {
    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(validationErrorMessage(error), 500);
  }
}
