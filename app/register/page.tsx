import { RegisterForms } from "@/app/register/register-forms";

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
  return (
    <RegisterForms eventId={eventId} registrationToken={registrationToken} />
  );
}
