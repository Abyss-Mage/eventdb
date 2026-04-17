import "server-only";

import { ID } from "node-appwrite";

import type { AdminAuthSession } from "@/lib/appwrite/auth-session";
import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";

export type AdminAuditStatus = "success" | "failure";

export type AdminAuditLogInput = {
  actorUserId: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  eventId?: string;
  details?: Record<string, unknown>;
  status: AdminAuditStatus;
  occurredAt?: Date | string;
};

const REDACTED_DETAIL_KEYS =
  /(password|otp|secret|api[_-]?key|token|recovery[_-]?codes?)/i;
const REDACTED_VALUE = "[REDACTED]";

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Admin audit log ${fieldName} is required.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOccurredAt(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new Error("Admin audit log occurredAt must be a valid datetime.");
    }

    return new Date(parsed).toISOString();
  }

  return new Date().toISOString();
}

function sanitizeDetailsValue(
  value: unknown,
  key: string | null,
  seen: WeakSet<object>,
): unknown {
  if (key && REDACTED_DETAIL_KEYS.test(key)) {
    return REDACTED_VALUE;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDetailsValue(entry, key, seen));
  }

  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const nextValue = sanitizeDetailsValue(childValue, childKey, seen);
      if (nextValue !== undefined) {
        sanitized[childKey] = nextValue;
      }
    }

    return sanitized;
  }

  return undefined;
}

function toDetailsJson(details: Record<string, unknown> | undefined): string | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized = sanitizeDetailsValue(details, null, new WeakSet()) as
    | Record<string, unknown>
    | undefined;
  if (!sanitized || Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return JSON.stringify(sanitized);
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export function getAdminAuditActor(auth: Pick<AdminAuthSession, "user">): {
  actorUserId: string;
  actorEmail?: string;
} {
  const actorUserId = normalizeRequiredText(auth.user.$id, "actorUserId");
  const actorEmail = normalizeOptionalText(auth.user.email);

  return {
    actorUserId,
    actorEmail,
  };
}

export async function writeAdminAuditLog(entry: AdminAuditLogInput): Promise<void> {
  const databases = getAppwriteDatabases();
  const { databaseId, adminAuditLogsCollectionId } = getAppwriteCollections();

  await databases.createDocument(
    databaseId,
    adminAuditLogsCollectionId,
    ID.unique(),
    stripUndefined({
      actorUserId: normalizeRequiredText(entry.actorUserId, "actorUserId"),
      actorEmail: normalizeOptionalText(entry.actorEmail),
      action: normalizeRequiredText(entry.action, "action"),
      resourceType: normalizeRequiredText(entry.resourceType, "resourceType"),
      resourceId: normalizeOptionalText(entry.resourceId),
      eventId: normalizeOptionalText(entry.eventId),
      detailsJson: toDetailsJson(entry.details),
      status: entry.status,
      occurredAt: normalizeOccurredAt(entry.occurredAt),
    }),
  );
}

export async function writeAdminAuditLogBestEffort(
  entry: AdminAuditLogInput,
): Promise<boolean> {
  try {
    await writeAdminAuditLog(entry);
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "unknown error";
    console.error(
      `Admin audit logging failed for action "${entry.action}": ${message}`,
    );
    return false;
  }
}
