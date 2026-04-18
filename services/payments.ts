import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { AppwriteException, Query, type Models } from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import type { EventRecord, PaymentStatus } from "@/lib/domain/types";
import { HttpError } from "@/lib/errors/http-error";
import { getRazorpayServerEnv } from "@/lib/payments/env";
import { getEventById } from "@/services/event-domain";

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";
const RAZORPAY_RECEIPT_MAX_LENGTH = 40;

type TransactionDocument = Models.Document & {
  tenantId?: string;
  organizerId?: string;
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  payeeType?: "escrow" | "organizer" | "platform" | "user_refund";
  transactionType?: "entry_fee_charge" | "escrow_credit";
  gateway?: "razorpay" | "internal";
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  amountMinor?: number;
  currency?: string;
  status?: PaymentStatus;
  metadataJson?: string;
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
};

export type CreatePaymentOrderInput = {
  eventId: string;
  registrationId?: string;
  payerUserId?: string;
  receipt?: string;
};

export type CreatePaymentOrderResult = {
  orderId: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  status: "initiated";
  keyId: string;
  transactionId: string;
};

export type VerifyPaymentCaptureInput = {
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  source: "callback" | "webhook";
  amountMinor?: number;
  currency?: string;
};

export type VerifyPaymentCaptureResult = {
  orderId: string;
  paymentId: string;
  status: "captured";
  replay: boolean;
  amountMinor: number;
  currency: string;
  transactions: {
    entryFeeChargeId: string;
    escrowCreditId: string;
  };
};

export type VerifyWebhookCaptureInput = {
  rawPayload: string;
  signature: string;
  event: string;
  payment: {
    id: string;
    orderId: string;
    amountMinor: number;
    currency: string;
    status?: string;
    notes?: Record<string, string>;
  };
};

function isAppwriteException(error: unknown): error is AppwriteException {
  return error instanceof AppwriteException;
}

function normalizeServiceError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isAppwriteException(error)) {
    const status = error.code >= 400 && error.code <= 599 ? error.code : 500;
    return new HttpError(error.message || "Appwrite request failed.", status);
  }

  return new HttpError("Unexpected payment service error.", 500);
}

function normalizeRequiredText(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new HttpError(`${fieldName} is required.`, 400);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeCurrency(value: string | undefined, fieldName: string): string {
  const normalized = normalizeRequiredText(value, fieldName).toUpperCase();
  if (normalized.length !== 3) {
    throw new HttpError(`${fieldName} must be a 3-letter ISO currency code.`, 400);
  }

  return normalized;
}

function normalizeNonNegativeInteger(value: number | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(`${fieldName} must be a non-negative integer.`, 400);
  }

  return value;
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function toDeterministicDocumentId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 22);
  return `${prefix}_${digest}`;
}

function toOrderReceipt(input: CreatePaymentOrderInput): string {
  const provided = normalizeOptionalText(input.receipt);
  if (provided) {
    if (provided.length > RAZORPAY_RECEIPT_MAX_LENGTH) {
      throw new HttpError(
        `receipt cannot exceed ${RAZORPAY_RECEIPT_MAX_LENGTH} characters.`,
        400,
      );
    }
    return provided;
  }

  const source = `${input.eventId}:${input.registrationId ?? ""}:${Date.now()}`;
  const compact = createHash("sha256").update(source).digest("hex").slice(0, 24);
  return `evt_${compact}`;
}

function ensureRegistrationWindowOpen(event: EventRecord): void {
  if (event.status !== "registration_open") {
    throw new HttpError("Payment can be initiated only while registration is open.", 409);
  }

  const opensAt = Date.parse(event.registrationOpensAt);
  const closesAt = Date.parse(event.registrationClosesAt);
  if (Number.isNaN(opensAt) || Number.isNaN(closesAt)) {
    throw new HttpError("Event registration window is misconfigured.", 500);
  }

  const now = Date.now();
  if (now < opensAt || now > closesAt) {
    throw new HttpError("Registration is closed for this event at the moment.", 409);
  }
}

function resolvePaidEventConfig(event: EventRecord): {
  eventId: string;
  tenantId: string;
  organizerId: string;
  amountMinor: number;
  currency: string;
} {
  const amountRaw = event.entryFeeMinor ?? 0;
  if (!Number.isInteger(amountRaw) || amountRaw < 0) {
    throw new HttpError("Event entry fee is misconfigured.", 500);
  }
  const amountMinor = amountRaw;
  if (amountMinor === 0) {
    throw new HttpError("This event is free. Payment order is not required.", 409);
  }

  const tenantId = normalizeRequiredText(event.tenantId, "Event tenantId");
  const organizerId = normalizeRequiredText(event.organizerId, "Event organizerId");
  const currency = normalizeCurrency(event.currency, "Event currency");

  return {
    eventId: event.id,
    tenantId,
    organizerId,
    amountMinor,
    currency,
  };
}

function getRazorpayApiConfig(): { keyId: string; keySecret: string } {
  const env = getRazorpayServerEnv();
  if (!env.keyId || !env.keySecret) {
    throw new HttpError(
      "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      503,
    );
  }

  return {
    keyId: env.keyId,
    keySecret: env.keySecret,
  };
}

function getRazorpayWebhookSecret(): string {
  const env = getRazorpayServerEnv();
  if (!env.webhookSecret) {
    throw new HttpError(
      "Razorpay webhook is not configured. Set RAZORPAY_WEBHOOK_SECRET.",
      503,
    );
  }

  return env.webhookSecret;
}

function safeSignatureMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readRazorpayError(response: Response): Promise<string | undefined> {
  const raw = await response.text();
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return raw;
    }

    const payload = parsed as Record<string, unknown>;
    const errorPayload =
      typeof payload.error === "object" && payload.error !== null
        ? (payload.error as Record<string, unknown>)
        : undefined;
    const message = errorPayload?.description ?? errorPayload?.reason ?? payload.error;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }

    return raw;
  } catch {
    return raw;
  }
}

async function createRazorpayOrder(input: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
  const config = getRazorpayApiConfig();
  const authHeader = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  const response = await fetch(`${RAZORPAY_API_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await readRazorpayError(response);
    const base = "Razorpay order creation failed.";
    const message = details ? `${base} ${details}` : base;
    throw new HttpError(
      message,
      response.status >= 400 && response.status <= 599 ? response.status : 502,
    );
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new HttpError("Razorpay order response has invalid shape.", 502);
  }

  const order = payload as Record<string, unknown>;
  const orderId =
    typeof order.id === "string" && order.id.trim().length > 0 ? order.id.trim() : null;
  const amountMinor = typeof order.amount === "number" ? order.amount : null;
  const currency =
    typeof order.currency === "string" && order.currency.trim().length > 0
      ? order.currency.trim().toUpperCase()
      : null;
  const status =
    typeof order.status === "string" && order.status.trim().length > 0
      ? order.status.trim()
      : null;
  const receipt =
    typeof order.receipt === "string" && order.receipt.trim().length > 0
      ? order.receipt.trim()
      : undefined;

  if (!orderId || amountMinor === null || !currency || !status) {
    throw new HttpError("Razorpay order response is missing required fields.", 502);
  }

  return {
    id: orderId,
    amount: amountMinor,
    currency,
    status,
    receipt,
  };
}

function verifySignatureFromPayload(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return safeSignatureMatch(expected, signature);
}

function validateCapturedPaymentStatus(status: string | undefined): void {
  if (!status) {
    return;
  }

  if (status !== "captured" && status !== "authorized") {
    throw new HttpError(`Razorpay payment has unsupported status: ${status}.`, 409);
  }
}

async function findEntryFeeChargeByOrderId(
  gatewayOrderId: string,
): Promise<TransactionDocument | undefined> {
  const databases = getAppwriteDatabases();
  const { databaseId, transactionsCollectionId } = getAppwriteCollections();

  const page = await databases.listDocuments<TransactionDocument>(
    databaseId,
    transactionsCollectionId,
    [
      Query.equal("gateway", "razorpay"),
      Query.equal("transactionType", "entry_fee_charge"),
      Query.equal("gatewayOrderId", gatewayOrderId),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ],
  );

  return page.documents[0];
}

async function findCapturedEntryFeeChargeByPaymentId(
  gatewayPaymentId: string,
): Promise<TransactionDocument | undefined> {
  const databases = getAppwriteDatabases();
  const { databaseId, transactionsCollectionId } = getAppwriteCollections();

  const page = await databases.listDocuments<TransactionDocument>(
    databaseId,
    transactionsCollectionId,
    [
      Query.equal("gateway", "razorpay"),
      Query.equal("transactionType", "entry_fee_charge"),
      Query.equal("status", "captured"),
      Query.equal("gatewayPaymentId", gatewayPaymentId),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ],
  );

  return page.documents[0];
}

function parseTransactionScope(document: TransactionDocument): {
  tenantId: string;
  organizerId: string;
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  amountMinor: number;
  currency: string;
} {
  const tenantId = normalizeRequiredText(document.tenantId, "Transaction tenantId");
  const organizerId = normalizeRequiredText(
    document.organizerId,
    "Transaction organizerId",
  );
  const amountMinor = normalizeNonNegativeInteger(
    document.amountMinor,
    "Transaction amountMinor",
  );
  const currency = normalizeCurrency(document.currency, "Transaction currency");

  return {
    tenantId,
    organizerId,
    eventId: normalizeOptionalText(document.eventId),
    registrationId: normalizeOptionalText(document.registrationId),
    payerUserId: normalizeOptionalText(document.payerUserId),
    amountMinor,
    currency,
  };
}

async function ensureEscrowCreditTransaction(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  tenantId: string;
  organizerId: string;
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  amountMinor: number;
  currency: string;
  source: "callback" | "webhook";
}): Promise<TransactionDocument> {
  const databases = getAppwriteDatabases();
  const { databaseId, transactionsCollectionId } = getAppwriteCollections();
  const documentId = toDeterministicDocumentId("esc", input.paymentId);

  try {
    return await databases.getDocument<TransactionDocument>(
      databaseId,
      transactionsCollectionId,
      documentId,
    );
  } catch (error) {
    if (!isAppwriteException(error) || error.code !== 404) {
      throw normalizeServiceError(error);
    }
  }

  try {
    return await databases.createDocument<TransactionDocument>(
      databaseId,
      transactionsCollectionId,
      documentId,
      stripUndefined({
        tenantId: input.tenantId,
        organizerId: input.organizerId,
        eventId: input.eventId,
        registrationId: input.registrationId,
        payerUserId: input.payerUserId,
        payeeType: "escrow",
        transactionType: "escrow_credit",
        gateway: "razorpay",
        gatewayOrderId: input.orderId,
        gatewayPaymentId: input.paymentId,
        gatewaySignature: input.signature,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "captured",
        metadataJson: JSON.stringify({
          source: input.source,
          stage: "escrow_credit",
        }),
      }),
    );
  } catch (error) {
    if (isAppwriteException(error) && error.code === 409) {
      return databases.getDocument<TransactionDocument>(
        databaseId,
        transactionsCollectionId,
        documentId,
      );
    }
    throw normalizeServiceError(error);
  }
}

async function capturePaymentInternal(
  input: VerifyPaymentCaptureInput,
): Promise<VerifyPaymentCaptureResult> {
  const databases = getAppwriteDatabases();
  const { databaseId, transactionsCollectionId } = getAppwriteCollections();

  const existingCaptured = await findCapturedEntryFeeChargeByPaymentId(input.razorpayPaymentId);
  if (existingCaptured) {
    const scope = parseTransactionScope(existingCaptured);
    if (
      normalizeOptionalText(existingCaptured.gatewayOrderId) !== input.razorpayOrderId
    ) {
      throw new HttpError("Payment replay has mismatched Razorpay order ID.", 409);
    }

    const escrowCredit = await ensureEscrowCreditTransaction({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
      tenantId: scope.tenantId,
      organizerId: scope.organizerId,
      eventId: scope.eventId,
      registrationId: scope.registrationId,
      payerUserId: scope.payerUserId,
      amountMinor: scope.amountMinor,
      currency: scope.currency,
      source: input.source,
    });

    return {
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      status: "captured",
      replay: true,
      amountMinor: scope.amountMinor,
      currency: scope.currency,
      transactions: {
        entryFeeChargeId: existingCaptured.$id,
        escrowCreditId: escrowCredit.$id,
      },
    };
  }

  const initiatedCharge = await findEntryFeeChargeByOrderId(input.razorpayOrderId);

  let scope:
    | {
        tenantId: string;
        organizerId: string;
        eventId?: string;
        registrationId?: string;
        payerUserId?: string;
        amountMinor: number;
        currency: string;
      }
    | undefined;

  if (initiatedCharge) {
    scope = parseTransactionScope(initiatedCharge);
  } else if (input.eventId) {
    const event = await getEventById(input.eventId);
    if (!event) {
      throw new HttpError("Event not found for payment capture.", 404);
    }
    const eventConfig = resolvePaidEventConfig(event);
    scope = {
      tenantId: eventConfig.tenantId,
      organizerId: eventConfig.organizerId,
      eventId: event.id,
      registrationId: input.registrationId,
      payerUserId: input.payerUserId,
      amountMinor: eventConfig.amountMinor,
      currency: eventConfig.currency,
    };
  }

  if (!scope) {
    throw new HttpError(
      "No initiated transaction found for this order. Cannot capture payment.",
      409,
    );
  }

  if (input.amountMinor !== undefined && input.amountMinor !== scope.amountMinor) {
    throw new HttpError("Captured amount does not match event entry fee.", 409);
  }

  if (
    input.currency !== undefined &&
    normalizeCurrency(input.currency, "Captured currency") !== scope.currency
  ) {
    throw new HttpError("Captured currency does not match event currency.", 409);
  }

  let chargeDocument: TransactionDocument;
  if (initiatedCharge) {
    chargeDocument = await databases.updateDocument<TransactionDocument>(
      databaseId,
      transactionsCollectionId,
      initiatedCharge.$id,
      stripUndefined({
        status: "captured",
        gatewayPaymentId: input.razorpayPaymentId,
        gatewaySignature: input.razorpaySignature,
        metadataJson: JSON.stringify({
          source: input.source,
          stage: "entry_fee_charge_captured",
          capturedAt: new Date().toISOString(),
        }),
      }),
    );
  } else {
    const documentId = toDeterministicDocumentId("chg", input.razorpayPaymentId);
    try {
      chargeDocument = await databases.createDocument<TransactionDocument>(
        databaseId,
        transactionsCollectionId,
        documentId,
        stripUndefined({
          tenantId: scope.tenantId,
          organizerId: scope.organizerId,
          eventId: scope.eventId,
          registrationId: scope.registrationId,
          payerUserId: scope.payerUserId,
          payeeType: "escrow",
          transactionType: "entry_fee_charge",
          gateway: "razorpay",
          gatewayOrderId: input.razorpayOrderId,
          gatewayPaymentId: input.razorpayPaymentId,
          gatewaySignature: input.razorpaySignature,
          amountMinor: scope.amountMinor,
          currency: scope.currency,
          status: "captured",
          metadataJson: JSON.stringify({
            source: input.source,
            stage: "entry_fee_charge_captured",
            createdFrom: "callback_without_initiated_row",
          }),
        }),
      );
    } catch (error) {
      if (isAppwriteException(error) && error.code === 409) {
        chargeDocument = await databases.getDocument<TransactionDocument>(
          databaseId,
          transactionsCollectionId,
          documentId,
        );
      } else {
        throw normalizeServiceError(error);
      }
    }
  }

  const escrowCredit = await ensureEscrowCreditTransaction({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
    tenantId: scope.tenantId,
    organizerId: scope.organizerId,
    eventId: scope.eventId,
    registrationId: scope.registrationId,
    payerUserId: scope.payerUserId,
    amountMinor: scope.amountMinor,
    currency: scope.currency,
    source: input.source,
  });

  return {
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    status: "captured",
    replay: false,
    amountMinor: scope.amountMinor,
    currency: scope.currency,
    transactions: {
      entryFeeChargeId: chargeDocument.$id,
      escrowCreditId: escrowCredit.$id,
    },
  };
}

export function verifyRazorpayCallbackSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const config = getRazorpayApiConfig();
  const payload = `${input.razorpayOrderId}|${input.razorpayPaymentId}`;
  return verifySignatureFromPayload(payload, input.razorpaySignature, config.keySecret);
}

export function verifyRazorpayWebhookSignature(input: {
  rawPayload: string;
  signature: string;
}): boolean {
  const webhookSecret = getRazorpayWebhookSecret();
  return verifySignatureFromPayload(input.rawPayload, input.signature, webhookSecret);
}

export async function createPaymentOrderForRegistration(
  input: CreatePaymentOrderInput,
): Promise<CreatePaymentOrderResult> {
  try {
    const eventId = normalizeRequiredText(input.eventId, "eventId");
    const registrationId = normalizeOptionalText(input.registrationId);
    const payerUserId = normalizeOptionalText(input.payerUserId);

    const event = await getEventById(eventId);
    if (!event) {
      throw new HttpError("Event not found.", 404);
    }
    const config = getRazorpayApiConfig();

    ensureRegistrationWindowOpen(event);
    const eventConfig = resolvePaidEventConfig(event);
    const receipt = toOrderReceipt({ eventId, registrationId, payerUserId, receipt: input.receipt });

    const order = await createRazorpayOrder({
      amountMinor: eventConfig.amountMinor,
      currency: eventConfig.currency,
      receipt,
      notes: stripUndefined({
        eventId,
        registrationId,
        payerUserId,
      }) as Record<string, string>,
    });

    const databases = getAppwriteDatabases();
    const { databaseId, transactionsCollectionId } = getAppwriteCollections();
    const transactionId = toDeterministicDocumentId("ord", order.id);

    try {
      await databases.createDocument(
        databaseId,
        transactionsCollectionId,
        transactionId,
        stripUndefined({
          tenantId: eventConfig.tenantId,
          organizerId: eventConfig.organizerId,
          eventId,
          registrationId,
          payerUserId,
          payeeType: "escrow",
          transactionType: "entry_fee_charge",
          gateway: "razorpay",
          gatewayOrderId: order.id,
          amountMinor: order.amount,
          currency: order.currency,
          status: "initiated",
          metadataJson: JSON.stringify({
            source: "order_create",
            receipt: order.receipt ?? receipt,
            gatewayOrderStatus: order.status,
          }),
        }),
      );
    } catch (error) {
      if (!(isAppwriteException(error) && error.code === 409)) {
        throw error;
      }
    }

    return {
      orderId: order.id,
      amountMinor: order.amount,
      currency: order.currency,
      receipt: order.receipt ?? receipt,
      status: "initiated",
      keyId: config.keyId,
      transactionId,
    };
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function verifyAndCaptureRazorpayPayment(
  input: VerifyPaymentCaptureInput,
): Promise<VerifyPaymentCaptureResult> {
  try {
    const razorpayOrderId = normalizeRequiredText(input.razorpayOrderId, "razorpayOrderId");
    const razorpayPaymentId = normalizeRequiredText(
      input.razorpayPaymentId,
      "razorpayPaymentId",
    );
    const razorpaySignature = normalizeRequiredText(
      input.razorpaySignature,
      "razorpaySignature",
    );

    const isValid = verifyRazorpayCallbackSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    if (!isValid) {
      throw new HttpError("Razorpay payment signature verification failed.", 401);
    }

    return capturePaymentInternal({
      ...input,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function verifyAndCaptureRazorpayWebhook(
  input: VerifyWebhookCaptureInput,
): Promise<VerifyPaymentCaptureResult> {
  try {
    if (!verifyRazorpayWebhookSignature(input)) {
      throw new HttpError("Razorpay webhook signature verification failed.", 401);
    }

    if (input.event !== "payment.captured") {
      throw new HttpError(`Unsupported Razorpay webhook event: ${input.event}.`, 409);
    }

    validateCapturedPaymentStatus(input.payment.status);

    return capturePaymentInternal({
      eventId: input.payment.notes?.eventId,
      registrationId: input.payment.notes?.registrationId,
      payerUserId: input.payment.notes?.payerUserId,
      razorpayOrderId: normalizeRequiredText(input.payment.orderId, "razorpayOrderId"),
      razorpayPaymentId: normalizeRequiredText(input.payment.id, "razorpayPaymentId"),
      razorpaySignature: normalizeRequiredText(input.signature, "x-razorpay-signature"),
      source: "webhook",
      amountMinor: normalizeNonNegativeInteger(
        input.payment.amountMinor,
        "Webhook payment amount",
      ),
      currency: normalizeCurrency(input.payment.currency, "Webhook payment currency"),
    });
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

