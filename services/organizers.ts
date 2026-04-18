import "server-only";

import { AppwriteException, ID, Query, type Models } from "node-appwrite";

import { organizerSchema } from "@/lib/domain/schemas";
import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { HttpError } from "@/lib/errors/http-error";
import type {
  OrganizerRecord,
  OrganizerVerificationStatus,
} from "@/lib/domain/types";

type OrganizerDocument = Models.Document & {
  tenantId?: string;
  ownerUserId?: string;
  name?: string;
  slug?: string;
  supportEmail?: string;
  verificationStatus?: OrganizerVerificationStatus;
  verificationBadge?: boolean;
  commissionRateBps?: number;
  payoutHoldDays?: number;
  isActive?: boolean;
};

export type ListOrganizersOptions = {
  verificationStatus?: OrganizerVerificationStatus;
  limit?: number;
};

export type CreateOrganizerInput = Omit<
  OrganizerRecord,
  "id" | "createdAt" | "updatedAt" | "verificationStatus" | "verificationBadge" | "isActive"
> & {
  verificationStatus?: OrganizerVerificationStatus;
  verificationBadge?: boolean;
  isActive?: boolean;
};

function isAppwriteException(error: unknown): error is AppwriteException {
  return error instanceof AppwriteException;
}

function normalizeServiceError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isAppwriteException(error)) {
    const status = error.code >= 400 && error.code <= 599 ? error.code : 500;
    return new HttpError(error.message || "Appwrite request failed.", status);
  }

  return new HttpError("Unexpected Appwrite service error.", 500);
}

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new HttpError(`${fieldName} is invalid.`, 500);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(`${fieldName} is invalid.`, 500);
  }

  return normalized;
}

function mapOrganizerDocument(document: OrganizerDocument): OrganizerRecord {
  const parsed = organizerSchema.safeParse({
    id: document.$id,
    tenantId: document.tenantId,
    ownerUserId: document.ownerUserId,
    name: document.name,
    slug: document.slug,
    supportEmail: document.supportEmail,
    verificationStatus: document.verificationStatus,
    verificationBadge: document.verificationBadge,
    commissionRateBps: document.commissionRateBps,
    payoutHoldDays: document.payoutHoldDays,
    isActive: document.isActive,
    createdAt: document.$createdAt ?? null,
    updatedAt: document.$updatedAt ?? null,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Organizer document has an invalid shape.", 500);
  }

  return parsed.data;
}

function toOrganizerWriteData(organizer: {
  tenantId: string;
  ownerUserId: string;
  name: string;
  slug: string;
  supportEmail: string;
  verificationStatus: OrganizerVerificationStatus;
  verificationBadge: boolean;
  commissionRateBps: number;
  payoutHoldDays: number;
  isActive: boolean;
}) {
  return {
    tenantId: normalizeRequiredText(organizer.tenantId, "tenantId"),
    ownerUserId: normalizeRequiredText(organizer.ownerUserId, "ownerUserId"),
    name: normalizeRequiredText(organizer.name, "name"),
    slug: normalizeRequiredText(organizer.slug, "slug").toLowerCase(),
    supportEmail: normalizeRequiredText(organizer.supportEmail, "supportEmail").toLowerCase(),
    verificationStatus: organizer.verificationStatus,
    verificationBadge: organizer.verificationBadge,
    commissionRateBps: organizer.commissionRateBps,
    payoutHoldDays: organizer.payoutHoldDays,
    isActive: organizer.isActive,
  };
}

function isNotFoundError(error: unknown): boolean {
  return isAppwriteException(error) && error.code === 404;
}

export async function listOrganizers(
  options: ListOrganizersOptions = {},
): Promise<OrganizerRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, organizersCollectionId } = getAppwriteCollections();
  const queryLimit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const queries = [Query.orderAsc("$createdAt"), Query.limit(queryLimit)];

  if (options.verificationStatus) {
    queries.unshift(Query.equal("verificationStatus", options.verificationStatus));
  }

  try {
    const documents = await databases.listDocuments<OrganizerDocument>(
      databaseId,
      organizersCollectionId,
      queries,
    );
    return documents.documents.map((document) => mapOrganizerDocument(document));
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function getOrganizerById(organizerId: string): Promise<OrganizerRecord | null> {
  const databases = getAppwriteDatabases();
  const { databaseId, organizersCollectionId } = getAppwriteCollections();
  const normalizedOrganizerId = normalizeRequiredText(organizerId, "organizerId");

  try {
    const document = await databases.getDocument<OrganizerDocument>(
      databaseId,
      organizersCollectionId,
      normalizedOrganizerId,
    );

    return mapOrganizerDocument(document);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw normalizeServiceError(error);
  }
}

export async function createOrganizer(
  input: CreateOrganizerInput,
): Promise<OrganizerRecord> {
  const databases = getAppwriteDatabases();
  const { databaseId, organizersCollectionId } = getAppwriteCollections();

  const writeData = toOrganizerWriteData({
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    name: input.name,
    slug: input.slug,
    supportEmail: input.supportEmail,
    verificationStatus: input.verificationStatus ?? "pending",
    verificationBadge: input.verificationBadge ?? false,
    commissionRateBps: input.commissionRateBps,
    payoutHoldDays: input.payoutHoldDays,
    isActive: input.isActive ?? true,
  });

  try {
    const document = await databases.createDocument<OrganizerDocument>(
      databaseId,
      organizersCollectionId,
      ID.unique(),
      writeData,
    );

    return mapOrganizerDocument(document);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function updateOrganizerVerification(
  organizerId: string,
  updates: {
    verificationStatus: OrganizerVerificationStatus;
    verificationBadge?: boolean;
    isActive?: boolean;
  },
): Promise<OrganizerRecord> {
  const existingOrganizer = await getOrganizerById(organizerId);
  if (!existingOrganizer) {
    throw new HttpError("Organizer not found.", 404);
  }

  const databases = getAppwriteDatabases();
  const { databaseId, organizersCollectionId } = getAppwriteCollections();

  const nextData = {
    verificationStatus: updates.verificationStatus,
    verificationBadge: updates.verificationBadge ?? existingOrganizer.verificationBadge,
    isActive: updates.isActive ?? existingOrganizer.isActive,
  };

  try {
    const updatedDocument = await databases.updateDocument<OrganizerDocument>(
      databaseId,
      organizersCollectionId,
      existingOrganizer.id,
      nextData,
    );

    return mapOrganizerDocument(updatedDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}
