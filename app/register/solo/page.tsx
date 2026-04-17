import { Suspense } from "react";

import { RegisterForms } from "@/app/register/register-forms";
import { RegistrationAppShell, RegistrationCanvas } from "@/app/register/registration-shell";
import { SurfacePanel } from "@/app/ui/foundation";

type RegisterSoloPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterSoloPage({ searchParams }: RegisterSoloPageProps) {
  const params = (await searchParams) ?? {};
  const eventIdValue = params.eventId;
  const tokenValue = params.token;
  const eventId = Array.isArray(eventIdValue)
    ? (eventIdValue[0] ?? "").trim()
    : (eventIdValue ?? "").trim();
  const registrationToken = Array.isArray(tokenValue)
    ? (tokenValue[0] ?? "").trim()
    : (tokenValue ?? "").trim();

  return (
    <RegistrationAppShell
      activeRoute="solo"
      eventId={eventId}
      registrationToken={registrationToken}
      title="Solo Queue Registration Hub"
      description="Enter the solo pool with role priority and optional rank data so admins can draft balanced squads."
    >
      <RegistrationCanvas
        className="registration-shell-grid"
        sidebarClassName="registration-shell-rail"
        contentClassName="registration-shell-content"
        sidebar={
          <>
            <SurfacePanel
              variant="glass"
              className="registration-shell-intro border-blue-300/35 bg-slate-950/80 p-5 sm:p-6"
            >
              <div className="relative z-10 space-y-3">
                <p className="type-eyebrow">Registration</p>
                <h2 className="type-title">Solo Queue Brief</h2>
                <p className="type-body-sm text-muted">
                  Provide role and profile details so admins can place you into balanced squads.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                    Solo assignment pool
                  </span>
                  <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                    Role preference required
                  </span>
                </div>
              </div>
            </SurfacePanel>

            <SurfacePanel
              variant="subtle"
              className="registration-shell-steps-panel border-white/10 bg-slate-950/55 p-4 sm:p-5"
            >
              <h3 className="type-title">Submission flow</h3>
              <ol className="registration-shell-steps mt-3 text-sm text-muted">
                {[
                  "Share player profile details and Discord contact.",
                  "Set preferred role and optional rank data for balancing.",
                  "Enter the solo queue for admin team assignment.",
                ].map((step, index) => (
                  <li key={step} className="registration-shell-step">
                    <span className="registration-shell-step-index">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </SurfacePanel>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: "Entry Type", value: "Solo Pool" },
                { label: "Role Pick", value: "Required" },
                { label: "Rank Data", value: "Optional" },
              ].map((item) => (
                <SurfacePanel
                  key={item.label}
                  variant="subtle"
                  className="border-white/10 bg-slate-950/55 p-3 text-center"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-soft">{item.value}</p>
                </SurfacePanel>
              ))}
            </div>
          </>
        }
      >
        <Suspense fallback={<p className="text-sm text-muted">Loading form...</p>}>
          <RegisterForms eventId={eventId} registrationToken={registrationToken} lockMode="solo" />
        </Suspense>
      </RegistrationCanvas>
    </RegistrationAppShell>
  );
}
