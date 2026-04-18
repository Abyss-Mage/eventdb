import {
  createOrganizerPayloadSchema,
  listOrganizersQuerySchema,
} from "@/lib/domain/schemas";
import { withAdminActorRouteAuth } from "@/lib/appwrite/auth-guard";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import {
  getAdminAuditActor,
  writeAdminAuditLogBestEffort,
} from "@/services/admin-audit";
import { createOrganizer, listOrganizers } from "@/services/organizers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminActorRouteAuth(request, async (authedRequest) => {
    const requestUrl = new URL(authedRequest.url);
    const parsedQuery = listOrganizersQuerySchema.safeParse({
      verificationStatus: requestUrl.searchParams.get("verificationStatus") ?? undefined,
      limit: requestUrl.searchParams.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues.at(0);
      return failure(issue?.message ?? "Invalid organizers query.", 400);
    }

    try {
      const organizers = await listOrganizers(parsedQuery.data);
      return success({ organizers });
    } catch (error) {
      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminActorRouteAuth(request, async (authedRequest, auth, actor) => {
    const auditActor = getAdminAuditActor(auth);

    let payload: unknown;
    try {
      payload = await authedRequest.json();
    } catch {
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.create",
        resourceType: "organizer",
        status: "failure",
        details: { reason: "invalid_json_payload" },
      });
      return failure("Invalid JSON payload.", 400);
    }

    const parsed = createOrganizerPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.create",
        resourceType: "organizer",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: issue?.message ?? "Invalid organizer payload.",
        },
      });
      return failure(issue?.message ?? "Invalid organizer payload.", 400);
    }

    try {
      const organizer = await createOrganizer(parsed.data);
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.create",
        resourceType: "organizer",
        resourceId: organizer.id,
        status: "success",
        details: {
          tenantId: organizer.tenantId,
          verificationStatus: organizer.verificationStatus,
          actorRoles: actor.roles,
        },
      });
      return success({ organizer }, 201);
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        ...auditActor,
        action: "admin.organizer.create",
        resourceType: "organizer",
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
