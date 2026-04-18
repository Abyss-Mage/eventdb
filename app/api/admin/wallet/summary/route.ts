import "server-only";

import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { failure, success } from "@/lib/http/response";
import { adminLedgerQuerySchema } from "@/lib/domain/schemas";
import { getOrganizerEarningsSummary, getUserPaymentSummary, getEventFinanceSummary } from "@/services/wallet";

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
      if (q.organizerId) {
        const summary = await getOrganizerEarningsSummary({ tenantId: q.tenantId, organizerId: q.organizerId });
        return success({ summary });
      }

      if (q.payerUserId) {
        const summary = await getUserPaymentSummary({ tenantId: q.tenantId, payerUserId: q.payerUserId });
        return success({ summary });
      }

      if (q.eventId) {
        const summary = await getEventFinanceSummary({ tenantId: q.tenantId, eventId: q.eventId });
        return success({ summary });
      }

      return failure("At least one of organizerId, payerUserId or eventId must be provided.", 400);
    } catch (err) {
      return failure((err as Error).message ?? "Internal error", 500);
    }
  });
}
