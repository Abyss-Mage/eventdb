import type { Metadata } from "next";

import { requireAdminTwoFactorSession } from "@/app/admin/admin-route-guard";
import { AdminTwoFactorFlow } from "@/app/admin/2fa/two-factor-flow";

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
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Two-Factor Setup</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">
          Complete required TOTP verification to continue to the admin dashboard.
        </p>
      </header>
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
    </div>
  );
}
