import "server-only";

import { Query, type Models } from "node-appwrite";
import { getAppwriteDatabases, getAppwriteCollections } from "@/lib/appwrite/server";

type TransactionDocument = Models.Document & {
  tenantId?: string;
  organizerId?: string;
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  payeeType?: "escrow" | "organizer" | "platform" | "user_refund";
  transactionType?:
    | "entry_fee_charge"
    | "escrow_credit"
    | "escrow_debit"
    | "commission_reserve"
    | "refund"
    | "adjustment";
  gateway?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  amountMinor?: number;
  currency?: string;
  status?: string;
  metadataJson?: string;
};

export type UserPaymentSummary = {
  payerUserId: string;
  tenantId?: string;
  totalChargesCount: number;
  totalChargesAmountMinor: number;
  totalRefundsCount: number;
  totalRefundsAmountMinor: number;
  totalSettledCount: number;
  totalSettledAmountMinor: number;
};

export type OrganizerEarningsSummary = {
  tenantId?: string;
  organizerId: string;
  totalEscrowCreditsCount: number;
  totalEscrowCreditsAmountMinor: number;
  totalEscrowCreditsSettledAmountMinor: number;
  totalEscrowCreditsPendingAmountMinor: number;
  totalEscrowDebitsAmountMinor: number;
  availableSettledAmountMinor: number;
};

export type EventFinanceSummary = {
  tenantId?: string;
  eventId: string;
  totalEntryFeeChargesCount: number;
  totalEntryFeeChargesAmountMinor: number;
  totalRefundsAmountMinor: number;
  totalEscrowCreditsAmountMinor: number;
};

function normalizeNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function listTransactions(options: {
  tenantId?: string;
  organizerId?: string;
  eventId?: string;
  payerUserId?: string;
  transactionType?: string;
  status?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}) {
  const databases = getAppwriteDatabases();
  const { databaseId, transactionsCollectionId } = getAppwriteCollections();

  const queries: unknown[] = [];
  if (options.tenantId) queries.push(Query.equal("tenantId", options.tenantId));
  if (options.organizerId) queries.push(Query.equal("organizerId", options.organizerId));
  if (options.eventId) queries.push(Query.equal("eventId", options.eventId));
  if (options.payerUserId) queries.push(Query.equal("payerUserId", options.payerUserId));
  if (options.transactionType) queries.push(Query.equal("transactionType", options.transactionType));
  if (options.status) queries.push(Query.equal("status", options.status));

  const limit = options.limit ?? 50;
  queries.push(Query.limit(limit));

  if (typeof options.offset === "number" && (Query as any).offset) {
    queries.push((Query as any).offset(options.offset));
  }

  if (options.order === "asc") {
    queries.push(Query.orderAsc("$createdAt"));
  } else {
    queries.push(Query.orderDesc("$createdAt"));
  }

  const page = await databases.listDocuments<TransactionDocument>(
    databaseId,
    transactionsCollectionId,
    queries as any[],
  );

  return {
    documents: page.documents,
    total: page.total ?? page.documents.length,
  };
}

export async function getUserPaymentSummary(params: {
  tenantId?: string;
  payerUserId: string;
}): Promise<UserPaymentSummary> {
  const { tenantId, payerUserId } = params;
  const page = await listTransactions({ tenantId, payerUserId, limit: 200 });

  const docs = page.documents;
  let chargesCount = 0;
  let chargesAmount = 0;
  let refundsCount = 0;
  let refundsAmount = 0;
  let settledCount = 0;
  let settledAmount = 0;

  for (const d of docs) {
    const t = d as TransactionDocument;
    const amount = normalizeNumber(t.amountMinor);
    if (t.transactionType === "entry_fee_charge") {
      chargesCount += 1;
      chargesAmount += amount;
    }
    if (t.transactionType === "refund") {
      refundsCount += 1;
      refundsAmount += amount;
    }
    if (t.status === "settled") {
      settledCount += 1;
      settledAmount += amount;
    }
  }

  return {
    payerUserId,
    tenantId,
    totalChargesCount: chargesCount,
    totalChargesAmountMinor: chargesAmount,
    totalRefundsCount: refundsCount,
    totalRefundsAmountMinor: refundsAmount,
    totalSettledCount: settledCount,
    totalSettledAmountMinor: settledAmount,
  };
}

export async function getOrganizerEarningsSummary(params: {
  tenantId?: string;
  organizerId: string;
}): Promise<OrganizerEarningsSummary> {
  const { tenantId, organizerId } = params;

  const credits = await listTransactions({
    tenantId,
    organizerId,
    transactionType: "escrow_credit",
    limit: 1000,
  });

  const debits = await listTransactions({
    tenantId,
    organizerId,
    transactionType: "escrow_debit",
    limit: 1000,
  });

  let creditsCount = 0;
  let creditsAmount = 0;
  let creditsSettled = 0;
  let creditsPending = 0;

  for (const d of credits.documents) {
    const amount = normalizeNumber(d.amountMinor);
    creditsCount += 1;
    creditsAmount += amount;
    if (d.status === "settled") {
      creditsSettled += amount;
    } else if (d.status !== "failed" && d.status !== "refunded") {
      creditsPending += amount;
    }
  }

  let debitsAmount = 0;
  let debitsSettled = 0;
  for (const d of debits.documents) {
    const amount = normalizeNumber(d.amountMinor);
    debitsAmount += amount;
    if (d.status === "settled") debitsSettled += amount;
  }

  const availableSettled = Math.max(0, creditsSettled - debitsSettled);

  return {
    tenantId,
    organizerId,
    totalEscrowCreditsCount: creditsCount,
    totalEscrowCreditsAmountMinor: creditsAmount,
    totalEscrowCreditsSettledAmountMinor: creditsSettled,
    totalEscrowCreditsPendingAmountMinor: creditsPending,
    totalEscrowDebitsAmountMinor: debitsAmount,
    availableSettledAmountMinor: availableSettled,
  };
}

export async function getEventFinanceSummary(params: {
  tenantId?: string;
  eventId: string;
}): Promise<EventFinanceSummary> {
  const { tenantId, eventId } = params;

  const charges = await listTransactions({ tenantId, eventId, transactionType: "entry_fee_charge", limit: 1000 });
  const refunds = await listTransactions({ tenantId, eventId, transactionType: "refund", limit: 1000 });
  const credits = await listTransactions({ tenantId, eventId, transactionType: "escrow_credit", limit: 1000 });

  let chargesCount = 0;
  let chargesAmount = 0;
  for (const d of charges.documents) {
    chargesCount += 1;
    chargesAmount += normalizeNumber(d.amountMinor);
  }

  let refundsAmount = 0;
  for (const d of refunds.documents) {
    refundsAmount += normalizeNumber(d.amountMinor);
  }

  let creditsAmount = 0;
  for (const d of credits.documents) {
    creditsAmount += normalizeNumber(d.amountMinor);
  }

  return {
    tenantId,
    eventId,
    totalEntryFeeChargesCount: chargesCount,
    totalEntryFeeChargesAmountMinor: chargesAmount,
    totalRefundsAmountMinor: refundsAmount,
    totalEscrowCreditsAmountMinor: creditsAmount,
  };
}
