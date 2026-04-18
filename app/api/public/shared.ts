import type { EventRecord, EventStatus } from "@/lib/domain/types";
import { HttpError } from "@/lib/errors/http-error";
import { listEvents } from "@/services/event-domain";

const ACTIVE_EVENT_STATUS_PRIORITY: EventStatus[] = [
  "registration_open",
  "in_progress",
  "registration_closed",
  "completed",
];

export async function resolveLatestActiveEvent(): Promise<EventRecord | null> {
  for (const status of ACTIVE_EVENT_STATUS_PRIORITY) {
    const events = await listEvents({ status, limit: 100 });
    const latest = events.at(-1);
    if (latest) {
      return latest;
    }
  }

  const fallback = await listEvents({ limit: 100 });
  return fallback.at(-1) ?? null;
}

export function parseLimit(
  value: string | null,
  options: { defaultValue: number; min?: number; max?: number },
): number {
  const min = options.min ?? 1;
  const max = options.max ?? 100;

  if (value === null) {
    return options.defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(`limit must be an integer between ${min} and ${max}.`, 400);
  }

  return parsed;
}
