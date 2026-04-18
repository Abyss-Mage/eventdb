import "server-only";

import { HttpError } from "@/lib/errors/http-error";
import type { PlatformRole } from "@/lib/domain/types";

export type PlatformAction =
  | "event.create"
  | "event.update"
  | "event.publish"
  | "event.archive"
  | "event.delete"
  | "registration.review"
  | "bracket.generate"
  | "match.report_result"
  | "payment.capture"
  | "payout.request"
  | "payout.review"
  | "admin.moderate";

const ACTION_ROLE_MATRIX: Record<PlatformAction, PlatformRole[]> = {
  "event.create": ["organizer", "admin"],
  "event.update": ["organizer", "admin"],
  "event.publish": ["organizer", "admin"],
  "event.archive": ["organizer", "admin"],
  "event.delete": ["admin"],
  "registration.review": ["organizer", "admin"],
  "bracket.generate": ["organizer", "admin"],
  "match.report_result": ["organizer", "admin"],
  "payment.capture": ["organizer", "admin"],
  "payout.request": ["organizer"],
  "payout.review": ["admin"],
  "admin.moderate": ["admin"],
};

function normalizeRoles(roles: PlatformRole[]): PlatformRole[] {
  const normalized: PlatformRole[] = [];
  for (const role of roles) {
    if (normalized.includes(role)) {
      continue;
    }

    normalized.push(role);
  }

  return normalized;
}

export function canPerformPlatformAction(
  roles: PlatformRole[],
  action: PlatformAction,
): boolean {
  const allowedRoles = ACTION_ROLE_MATRIX[action];
  const normalizedRoles = normalizeRoles(roles);
  return normalizedRoles.some((role) => allowedRoles.includes(role));
}

export function requirePlatformAction(
  roles: PlatformRole[],
  action: PlatformAction,
): void {
  if (canPerformPlatformAction(roles, action)) {
    return;
  }

  throw new HttpError("Forbidden for current actor role.", 403);
}
