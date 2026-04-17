import type { Metadata } from "next";

import { requireAdminTwoFactorSession } from "@/app/admin/admin-route-guard";
import { AdminTwoFactorFlow } from "@/app/admin/2fa/two-factor-flow";
import { PageContainer, SectionHeader } from "@/app/ui/foundation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin Two-Factor",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminTwoFactorPage() {
  const auth = await requireAdminTwoFactorSession();

  return (
    <PageContainer width="default" className="py-16">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <SectionHeader
            title="Two-Factor Verification"
            description="Complete TOTP setup or challenge to unlock dashboard access."
          />
          <div className="surface-base surface-glass space-y-3 p-5">
            <p className="type-eyebrow">Signed-in Admin</p>
            <p className="type-subtitle break-all text-soft">{auth.user.email}</p>
            <p className="text-sm text-muted">
              This verification step is mandatory for all protected admin routes.
            </p>
          </div>
        </section>

        <section className="surface-base surface-elevated p-5">
          <AdminTwoFactorFlow
            email={auth.user.email}
            initialMfaState={{
              required: auth.mfa.required,
              verified: auth.mfa.verified,
              totpEnrolled: auth.mfa.totpEnrolled,
              setupRequired: auth.mfa.setupRequired,
              challengeRequired: auth.mfa.challengeRequired,
              mfaEnabled: auth.mfa.mfaEnabled,
            }}
          />
        </section>
      </div>
    </PageContainer>
  );
}
