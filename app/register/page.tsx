import Link from "next/link";

import {
  getRegistrationHref,
  RegistrationAppShell,
  RegistrationCanvas,
} from "@/app/register/registration-shell";
import { SurfacePanel } from "@/app/ui/foundation";

type RegisterPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const eventIdValue = params.eventId;
  const tokenValue = params.token;
  const eventId = Array.isArray(eventIdValue)
    ? (eventIdValue[0] ?? "").trim()
    : (eventIdValue ?? "").trim();
  const registrationToken = Array.isArray(tokenValue)
    ? (tokenValue[0] ?? "").trim()
    : (tokenValue ?? "").trim();
  const teamHref = getRegistrationHref("team", { eventId, registrationToken });
  const soloHref = getRegistrationHref("solo", { eventId, registrationToken });
  const hasScopedParams = Boolean(eventId || registrationToken);

  return (
    <RegistrationAppShell
      activeRoute="hub"
      eventId={eventId}
      registrationToken={registrationToken}
      title="Choose Your Entry Path"
      description="Team captains can submit full rosters, while solo players can enter the assignment pool."
    >
      <RegistrationCanvas
        sidebar={null}
        sidebarClassName="hidden"
        contentClassName="lg:col-span-12 xl:col-span-10 xl:col-start-2"
      >
        <SurfacePanel
          variant="elevated"
          className="registration-form-surface registration-form-surface--chooser space-y-6 p-4 sm:p-6 lg:p-7"
        >
          <div className="registration-form-content space-y-4">
            <p className="type-eyebrow">Registration Hub</p>
            <h2 className="type-title">Start your submission</h2>
            <p className="type-body-sm text-muted">
              Choose the correct route and continue to the dedicated form flow while keeping your
              event-scoped query context intact.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                Team rosters: 2-6 players
              </span>
              <span className="surface-base surface-subtle rounded-full px-3 py-1 text-xs text-soft">
                Solo players: admin-assigned teams
              </span>
            </div>
          </div>

          <div className="registration-choice-grid">
            <SurfacePanel
              variant="elevated"
              interactive
              className="registration-choice-card flex h-full flex-col gap-4 p-5 sm:p-6"
            >
              <p className="type-eyebrow">Captain Track</p>
              <h3 className="type-title">Register a Team</h3>
              <p className="type-body-sm text-muted">
                Best for captains with a ready roster. Submit team identity, contact info, and all
                player slots in one pass.
              </p>
              <ul className="space-y-1 text-sm text-muted">
                <li>• Dedicated team roster form</li>
                <li>• Supports 2-6 players</li>
                <li>• Admin verification before approval</li>
              </ul>
              <Link href={teamHref} className="btn-base btn-primary mt-auto w-full sm:w-auto">
                Continue to Team Registration
              </Link>
            </SurfacePanel>

            <SurfacePanel
              variant="elevated"
              interactive
              className="registration-choice-card flex h-full flex-col gap-4 p-5 sm:p-6"
            >
              <p className="type-eyebrow">Solo Track</p>
              <h3 className="type-title">Register as Solo</h3>
              <p className="type-body-sm text-muted">
                Perfect if you need a squad. Enter your player profile to join the solo pool for
                managed team assignment.
              </p>
              <ul className="space-y-1 text-sm text-muted">
                <li>• Fast single-player registration</li>
                <li>• Added to solo assignment pool</li>
                <li>• Event-scoped eligibility checks</li>
              </ul>
              <Link href={soloHref} className="btn-base btn-secondary mt-auto w-full sm:w-auto">
                Continue to Solo Registration
              </Link>
            </SurfacePanel>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SurfacePanel variant="subtle" className="p-4 sm:p-5">
              <h3 className="type-title">What happens next</h3>
              <ol className="mt-3 space-y-2 text-sm text-muted">
                <li>1. Pick Team or Solo to enter the correct form flow.</li>
                <li>2. Submit your details with event-scoped credentials.</li>
                <li>3. Wait for admin review and bracket placement updates.</li>
              </ol>
            </SurfacePanel>

            <SurfacePanel variant="subtle" className="p-4 sm:p-5">
              <p className="type-body-sm text-muted">
                {hasScopedParams
                  ? "Event token and event ID are preserved while moving between registration routes."
                  : "Add eventId and token query parameters to keep submissions event-scoped."}
              </p>
            </SurfacePanel>
          </div>
        </SurfacePanel>
      </RegistrationCanvas>
    </RegistrationAppShell>
  );
}
