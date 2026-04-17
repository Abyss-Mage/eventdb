import { withAdminRouteAuth } from "@/lib/appwrite/auth-guard";
import { failure, getErrorMessage, success } from "@/lib/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return withAdminRouteAuth(request, async (_, auth) =>
      success({
        authenticated: true as const,
        user: {
          id: auth.user.$id,
          email: auth.user.email,
          name: auth.user.name,
        },
        session: {
          id: auth.session.$id,
          expire: auth.session.expire,
          factors: auth.session.factors,
          mfaUpdatedAt: auth.session.mfaUpdatedAt,
        },
        mfa: {
          required: auth.mfa.required,
          verified: auth.mfa.verified,
          totpEnrolled: auth.mfa.totpEnrolled,
          setupRequired: auth.mfa.setupRequired,
          challengeRequired: auth.mfa.challengeRequired,
          mfaEnabled: auth.mfa.mfaEnabled,
        },
      }),
      { requireMfa: false },
    );
  } catch (error) {
    return failure(getErrorMessage(error), 500);
  }
}
