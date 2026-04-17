import type { EventRecord } from "@/lib/domain/types";

export function formatEventStatus(value: EventRecord["status"]): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildRegistrationPath(eventId: string, token: string): string {
  const query = new URLSearchParams({ eventId, token });
  return `/register?${query.toString()}`;
}
