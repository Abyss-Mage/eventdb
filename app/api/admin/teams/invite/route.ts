import { adminRegenerateTeamInviteSchema } from "@/lib/domain/schemas";
import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { regenerateTeamInviteCode } from "@/services/registrations";

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
        action: "admin.team.invite.regenerate",
        resourceType: "team",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = adminRegenerateTeamInviteSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.invite.regenerate",
        resourceType: "team",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: issue?.message ?? "Invalid team invite payload.",
        },
      });
      return failure(issue?.message ?? "Invalid team invite payload.", 400);
    }

    try {
      const invite = await regenerateTeamInviteCode(parsed.data.eventId, parsed.data.teamId);
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.invite.regenerate",
        resourceType: "team",
        resourceId: invite.teamId,
        eventId: invite.eventId,
        status: "success",
      });
      return success({ invite });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...actor,
        action: "admin.team.invite.regenerate",
        resourceType: "team",
        resourceId: parsed.data.teamId,
        eventId: parsed.data.eventId,
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}
