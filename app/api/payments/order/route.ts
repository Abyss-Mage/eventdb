import { createRegistrationPaymentOrderSchema } from "@/lib/domain/schemas";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { writeAdminAuditLogBestEffort } from "@/services/admin-audit";
import { createPaymentOrderForRegistration } from "@/services/payments";

export const runtime = "nodejs";

const AUDIT_ACTOR_USER_ID = "system:payments";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.order.create",
      resourceType: "transaction",
      status: "failure",
      details: { reason: "invalid_json_payload" },
    });
    return failure("Invalid JSON payload.", 400);
  }

  const parsed = createRegistrationPaymentOrderSchema.safeParse(payload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues.at(0);
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.order.create",
      resourceType: "transaction",
      status: "failure",
      details: {
        reason: "invalid_payload",
        validationError: firstIssue?.message ?? "Invalid payment order payload.",
      },
    });
    return failure(firstIssue?.message ?? "Invalid payment order payload.", 400);
  }

  try {
    const order = await createPaymentOrderForRegistration(parsed.data);
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.order.create",
      resourceType: "transaction",
      resourceId: order.transactionId,
      eventId: parsed.data.eventId,
      status: "success",
      details: {
        orderId: order.orderId,
        amountMinor: order.amountMinor,
        currency: order.currency,
        registrationId: parsed.data.registrationId,
      },
    });
    return success({ order }, 201);
  } catch (error) {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.order.create",
      resourceType: "transaction",
      eventId: parsed.data.eventId,
      status: "failure",
      details: {
        reason: isHttpError(error) ? "service_error" : "unexpected_error",
        errorMessage: getErrorMessage(error),
        registrationId: parsed.data.registrationId,
      },
    });

    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}

