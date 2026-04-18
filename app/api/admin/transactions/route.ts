import "server-only";

import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { failure, success } from "@/lib/http/response";
import { adminLedgerQuerySchema } from "@/lib/domain/schemas";
import { listTransactions } from "@/services/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminRouteAuth(request, async (authedRequest) => {
    const url = new URL(authedRequest.url);
    const parsed = adminLedgerQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      const first = parsed.error.issues.at(0);
      return failure(first?.message ?? "Invalid query.", 400);
    }

    const q = parsed.data;

    try {
      const page = await listTransactions({
        tenantId: q.tenantId,
        organizerId: q.organizerId,
        eventId: q.eventId,
        payerUserId: q.payerUserId,
        transactionType: q.transactionType,
        status: q.status,
        limit: q.limit ?? 50,
        offset: q.offset,
        order: q.order as any,
      });

      return success({ transactions: page.documents, total: page.total });
    } catch (err) {
      return failure((err as Error).message ?? "Internal error", 500);
    }
  });
}
