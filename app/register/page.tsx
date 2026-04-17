import { Suspense } from "react";

import { RegisterForms } from "@/app/register/register-forms";

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Player Registration</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">
          Choose team or solo registration to continue. Team entries are reviewed by
          admins, and solo entries are added to the free-agent pool. Include{" "}
          <code>?eventId=...</code> in the URL.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading form...</p>}>
        <RegisterForms />
      </Suspense>
    </div>
  );
}
