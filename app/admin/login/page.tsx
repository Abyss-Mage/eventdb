import type { Metadata } from "next";

import { redirectAuthenticatedAdminFromLogin } from "@/app/admin/admin-route-guard";
import { AdminLoginForm } from "@/app/admin/login/admin-login-form";
import { PageContainer, SectionHeader } from "@/app/ui/foundation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin Login",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLoginPage() {
  await redirectAuthenticatedAdminFromLogin();

  return (
    <PageContainer width="default" className="py-16">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <SectionHeader
            title="Admin Access"
            description="Sign in to continue to secure event operations. MFA is required before dashboard access is granted."
          />
          <div className="surface-base surface-glass space-y-3 p-5">
            <p className="type-eyebrow">Security Layers</p>
            <ul className="space-y-2 text-sm text-muted">
              <li>• Appwrite email/password sign-in</li>
              <li>• Admin team membership check</li>
              <li>• Required TOTP setup and verification</li>
            </ul>
          </div>
        </section>

        <section className="surface-base surface-elevated p-5">
          <SectionHeader
            className="mb-4"
            title="Sign In"
            description="Use your admin credentials to start verification."
          />
          <AdminLoginForm />
        </section>
      </div>
    </PageContainer>
  );
}
