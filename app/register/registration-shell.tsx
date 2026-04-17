import Link from "next/link";
import type { ReactNode } from "react";

import { cx, PageContainer, SurfacePanel } from "@/app/ui/foundation";

type RegistrationRoute = "hub" | "team" | "solo";

type RegistrationLinkOptions = {
  eventId?: string;
  registrationToken?: string;
};

type RegistrationAppShellProps = RegistrationLinkOptions & {
  children: ReactNode;
  className?: string;
  activeRoute: RegistrationRoute;
  title?: string;
  description?: string;
};

type RegistrationCanvasProps = {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
};

const routeToPath: Record<RegistrationRoute, string> = {
  hub: "/register",
  team: "/register/team",
  solo: "/register/solo",
};

const routeToLabel: Record<RegistrationRoute, string> = {
  hub: "Overview",
  team: "Team",
  solo: "Solo",
};

function buildQuerySuffix({ eventId, registrationToken }: RegistrationLinkOptions) {
  const params = new URLSearchParams();

  if (eventId) {
    params.set("eventId", eventId);
  }

  if (registrationToken) {
    params.set("token", registrationToken);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getRegistrationHref(
  route: RegistrationRoute,
  options: RegistrationLinkOptions = {},
) {
  return `${routeToPath[route]}${buildQuerySuffix(options)}`;
}

export function RegistrationAppShell({
  children,
  className,
  activeRoute,
  title = "Event Registration",
  description = "Select your path, complete required details, and submit with event-scoped credentials.",
  eventId,
  registrationToken,
}: RegistrationAppShellProps) {
  return (
    <PageContainer width="wide" className="py-8 lg:py-12">
      <div className={cx("registration-shell-layout space-y-6", className)}>
        <SurfacePanel variant="glass" className="registration-app-bar p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="type-eyebrow">Registration</p>
              <h1 className="type-headline-lg">{title}</h1>
              <p className="type-body-sm text-muted">{description}</p>
            </div>

            <nav aria-label="Registration navigation" className="registration-app-nav flex flex-wrap gap-2">
              {(Object.keys(routeToPath) as RegistrationRoute[]).map((route) => {
                const isActive = route === activeRoute;

                return (
                  <Link
                    key={route}
                    href={getRegistrationHref(route, { eventId, registrationToken })}
                    aria-current={isActive ? "page" : undefined}
                    className={cx(
                      "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition",
                      isActive
                        ? "border-red-300/65 bg-red-500/20 text-red-100"
                        : "border-white/15 bg-slate-950/45 text-muted hover:border-red-300/45 hover:text-soft",
                    )}
                  >
                    {routeToLabel[route]}
                  </Link>
                );
              })}
            </nav>
          </div>
        </SurfacePanel>

        {children}
      </div>
    </PageContainer>
  );
}

export function RegistrationCanvas({
  sidebar,
  children,
  className,
  sidebarClassName,
  contentClassName,
}: RegistrationCanvasProps) {
  return (
    <div className={cx("registration-canvas grid gap-5 lg:grid-cols-12", className)}>
      <aside className={cx("registration-canvas-sidebar min-w-0 space-y-4 lg:col-span-3", sidebarClassName)}>
        {sidebar}
      </aside>
      <section className={cx("registration-canvas-content min-w-0 lg:col-span-9", contentClassName)}>
        {children}
      </section>
    </div>
  );
}
