import { DashboardClient } from "@/app/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">
          Review pending registrations and approve or reject them.
        </p>
      </header>
      <DashboardClient />
    </div>
  );
}
