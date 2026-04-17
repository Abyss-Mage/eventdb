import { Suspense } from "react";

import { RegisterForms } from "@/app/register/register-forms";
import { RegistrationAppShell, RegistrationCanvas } from "@/app/register/registration-shell";
import { SurfacePanel } from "@/app/ui/foundation";

type RegisterTeamPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterTeamPage({ searchParams }: RegisterTeamPageProps) {
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
      activeRoute="team"
      eventId={eventId}
      registrationToken={registrationToken}
      title="Team Registration Command Center"
      description="Deploy your full roster with captain credentials, role balance, and tournament-ready details."
    >
      <RegistrationCanvas
        className="registration-shell-grid"
        sidebarClassName="registration-shell-rail"
        contentClassName="registration-shell-content"
        sidebar={
          <>
            <SurfacePanel
              variant="glass"
              className="registration-shell-intro border-red-300/35 bg-slate-950/80 p-5 sm:p-6"
            >
              <div className="relative z-10 space-y-3">
                <p className="type-eyebrow">Registration</p>
                <h2 className="type-title">Team Ops Brief</h2>
                <p className="type-body-sm text-muted">
                  Lock roster details before submitting the final lineup for review.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                    2-6 players per roster
                  </span>
                  <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                    Captain verification required
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
                  "Capture team intel and captain contact details.",
                  "Fill every player slot with Riot and Discord IDs.",
                  "Submit roster for admin verification and bracket placement.",
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
                { label: "Roster Window", value: "2-6 Players" },
                { label: "Captain", value: "Required" },
                { label: "Review", value: "Admin Verified" },
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
          <RegisterForms eventId={eventId} registrationToken={registrationToken} lockMode="team" />
        </Suspense>
      </RegistrationCanvas>
    </RegistrationAppShell>
  );
}
