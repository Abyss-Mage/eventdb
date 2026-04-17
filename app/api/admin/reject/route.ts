import { rejectRegistrationSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { rejectRegistration } from "@/services/registrations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest, auth) => {
    const actor = getAdminAuditActor(auth);

    let payload: unknown;

    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.registration.reject",
        resourceType: "registration",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = rejectRegistrationSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.registration.reject",
        resourceType: "registration",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid reject payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid reject payload.", 400);
    }

    try {
      await rejectRegistration(parsed.data.registrationId, parsed.data.reason);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.registration.reject",
        resourceType: "registration",
        resourceId: parsed.data.registrationId,
        status: "success",
        details: {
          hasReason: Boolean(parsed.data.reason),
        },
      });
      return success({
        registrationId: parsed.data.registrationId,
        status: "rejected" as const,
      });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.registration.reject",
        resourceType: "registration",
        resourceId: parsed.data.registrationId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          hasReason: Boolean(parsed.data.reason),
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
