import {
  razorpayWebhookCaptureSchema,
  verifyRazorpayPaymentSchema,
} from "@/lib/domain/schemas";
import { isHttpError } from "@/lib/errors/http-error";
import { failure, getErrorMessage, success } from "@/lib/http/response";
import { writeAdminAuditLogBestEffort } from "@/services/admin-audit";
import {
  verifyAndCaptureRazorpayPayment,
  verifyAndCaptureRazorpayWebhook,
} from "@/services/payments";

export const runtime = "nodejs";

const AUDIT_ACTOR_USER_ID = "system:payments";

export async function POST(request: Request) {
  let rawPayload: string;

  try {
    rawPayload = await request.text();
  } catch {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify",
      resourceType: "transaction",
      status: "failure",
      details: { reason: "invalid_payload_read" },
    });
    return failure("Unable to read request payload.", 400);
  }

  if (rawPayload.trim().length === 0) {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify",
      resourceType: "transaction",
      status: "failure",
      details: { reason: "empty_payload" },
    });
    return failure("Payload is required.", 400);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload) as unknown;
  } catch {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify",
      resourceType: "transaction",
      status: "failure",
      details: { reason: "invalid_json_payload" },
    });
    return failure("Invalid JSON payload.", 400);
  }

  const webhookSignatureHeader = request.headers.get("x-razorpay-signature")?.trim();
  const hasWebhookSignature =
    typeof webhookSignatureHeader === "string" && webhookSignatureHeader.length > 0;

  if (hasWebhookSignature) {
    const webhookSignature = webhookSignatureHeader;
    if (!webhookSignature) {
      return failure("Missing x-razorpay-signature header.", 400);
    }

    const parsedWebhook = razorpayWebhookCaptureSchema.safeParse(parsedJson);
    if (!parsedWebhook.success) {
      const firstIssue = parsedWebhook.error.issues.at(0);
      await writeAdminAuditLogBestEffort({
        actorUserId: AUDIT_ACTOR_USER_ID,
        action: "payment.verify.webhook",
        resourceType: "transaction",
        status: "failure",
        details: {
          reason: "invalid_payload",
          validationError: firstIssue?.message ?? "Invalid webhook payload.",
        },
      });
      return failure(firstIssue?.message ?? "Invalid webhook payload.", 400);
    }

    if (parsedWebhook.data.event !== "payment.captured") {
      await writeAdminAuditLogBestEffort({
        actorUserId: AUDIT_ACTOR_USER_ID,
        action: "payment.verify.webhook",
        resourceType: "transaction",
        status: "success",
        details: {
          ignored: true,
          event: parsedWebhook.data.event,
        },
      });
      return success(
        {
          ignored: true as const,
          reason: `Unsupported event: ${parsedWebhook.data.event}`,
        },
        202,
      );
    }

    try {
      const capture = await verifyAndCaptureRazorpayWebhook({
        rawPayload,
        signature: webhookSignature,
        event: parsedWebhook.data.event,
        payment: {
          id: parsedWebhook.data.payload.payment.entity.id,
          orderId: parsedWebhook.data.payload.payment.entity.order_id,
          amountMinor: parsedWebhook.data.payload.payment.entity.amount,
          currency: parsedWebhook.data.payload.payment.entity.currency,
          status: parsedWebhook.data.payload.payment.entity.status,
          notes: parsedWebhook.data.payload.payment.entity.notes,
        },
      });

      await writeAdminAuditLogBestEffort({
        actorUserId: AUDIT_ACTOR_USER_ID,
        action: "payment.verify.webhook",
        resourceType: "transaction",
        resourceId: capture.transactions.entryFeeChargeId,
        status: "success",
        details: {
          replay: capture.replay,
          orderId: capture.orderId,
          paymentId: capture.paymentId,
          amountMinor: capture.amountMinor,
          currency: capture.currency,
        },
      });

      return success({ source: "webhook" as const, capture });
    } catch (error) {
      await writeAdminAuditLogBestEffort({
        actorUserId: AUDIT_ACTOR_USER_ID,
        action: "payment.verify.webhook",
        resourceType: "transaction",
        status: "failure",
        details: {
          reason: isHttpError(error) ? "service_error" : "unexpected_error",
          errorMessage: getErrorMessage(error),
          event: parsedWebhook.data.event,
        },
      });

      if (isHttpError(error)) {
        return failure(error.message, error.status);
      }

      return failure(getErrorMessage(error), 500);
    }
  }

  const parsedCallback = verifyRazorpayPaymentSchema.safeParse(parsedJson);
  if (!parsedCallback.success) {
    const firstIssue = parsedCallback.error.issues.at(0);
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify.callback",
      resourceType: "transaction",
      status: "failure",
      details: {
        reason: "invalid_payload",
        validationError: firstIssue?.message ?? "Invalid callback payload.",
      },
    });
    return failure(firstIssue?.message ?? "Invalid callback payload.", 400);
  }

  try {
    const capture = await verifyAndCaptureRazorpayPayment({
      ...parsedCallback.data,
      source: "callback",
    });
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify.callback",
      resourceType: "transaction",
      resourceId: capture.transactions.entryFeeChargeId,
      eventId: parsedCallback.data.eventId,
      status: "success",
      details: {
        replay: capture.replay,
        orderId: capture.orderId,
        paymentId: capture.paymentId,
        amountMinor: capture.amountMinor,
        currency: capture.currency,
      },
    });
    return success({ source: "callback" as const, capture });
  } catch (error) {
    await writeAdminAuditLogBestEffort({
      actorUserId: AUDIT_ACTOR_USER_ID,
      action: "payment.verify.callback",
      resourceType: "transaction",
      eventId: parsedCallback.data.eventId,
      status: "failure",
      details: {
        reason: isHttpError(error) ? "service_error" : "unexpected_error",
        errorMessage: getErrorMessage(error),
        orderId: parsedCallback.data.razorpayOrderId,
        paymentId: parsedCallback.data.razorpayPaymentId,
      },
    });

    if (isHttpError(error)) {
      return failure(error.message, error.status);
    }

    return failure(getErrorMessage(error), 500);
  }
}

