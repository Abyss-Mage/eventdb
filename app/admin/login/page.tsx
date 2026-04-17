import type { Metadata } from "next";

import { redirectAuthenticatedAdminFromLogin } from "@/app/admin/admin-route-guard";
import { AdminLoginForm } from "@/app/admin/login/admin-login-form";

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
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Login</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">
          Sign in with your Appwrite email/password account to access the admin
          dashboard.
        </p>
      </header>
      <AdminLoginForm />
    </div>
  );
}
