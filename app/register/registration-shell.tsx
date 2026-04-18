import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/app/ui/foundation";

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
  title = "Registration",
  description = "Public registration UI is in teardown state pending rebuild.",
  eventId,
  registrationToken,
}: RegistrationAppShellProps) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1rem" }}>
      <div className={cx("space-y-4", className)}>
        <header>
          <p style={{ margin: 0, opacity: 0.8 }}>Public Entry</p>
          <h1 style={{ margin: "0.5rem 0" }}>{title}</h1>
          <p style={{ margin: 0, opacity: 0.85 }}>{description}</p>
        </header>
        <nav aria-label="Registration navigation" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(Object.keys(routeToPath) as RegistrationRoute[]).map((route) => {
            const isActive = route === activeRoute;
            return (
              <Link
                key={route}
                href={getRegistrationHref(route, { eventId, registrationToken })}
                aria-current={isActive ? "page" : undefined}
                style={{ textDecoration: isActive ? "underline" : "none" }}
              >
                {routeToLabel[route]}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
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
    <div className={cx("grid gap-4 lg:grid-cols-12", className)}>
      <aside className={cx("min-w-0 lg:col-span-3", sidebarClassName)}>
        {sidebar}
      </aside>
      <section className={cx("min-w-0 lg:col-span-9", contentClassName)}>
        {children}
      </section>
    </div>
  );
}
