"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV_ITEMS, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";

type AdminShellProps = {
  userEmail: string;
  children: ReactNode;
};

function isActivePath(pathname: string, href: string) {
  if (href === DASHBOARD_ROUTES.overview) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ userEmail, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="surface-base surface-glass h-fit min-w-0 p-4 xl:sticky xl:top-6">
          <div className="border-b border-[var(--surface-border)] pb-4">
            <p className="type-eyebrow">Admin Console</p>
            <p className="mt-2 type-subtitle text-soft">Operations Dashboard</p>
            <p className="mt-2 break-all text-xs text-muted">{userEmail}</p>
          </div>
          <nav className="mt-4 grid gap-1.5">
            {DASHBOARD_NAV_ITEMS.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md border px-3 py-2 text-sm transition ${
                    isActive
                      ? "border-[rgb(248_113_113_/_0.55)] bg-[rgb(239_68_68_/_0.92)] text-white"
                      : "border-[var(--surface-border)] text-muted hover:border-[var(--surface-border-strong)] hover:bg-slate-800/70 hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="dashboard-skin min-w-0 space-y-6">{children}</main>
      </div>
    </div>
  );
}
