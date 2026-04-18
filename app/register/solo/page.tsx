import { Suspense } from "react";

import { RegisterForms } from "@/app/register/register-forms";

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
    <Suspense fallback={<p className="text-sm text-muted">Loading form...</p>}>
      <RegisterForms eventId={eventId} registrationToken={registrationToken} lockMode="solo" />
    </Suspense>
  );
}
