import "server-only";

import { Query, type Models } from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { HttpError } from "@/lib/errors/http-error";
import type { PlatformRole } from "@/lib/domain/types";

type PlatformUserDocument = Models.Document & {
  appwriteUserId?: string;
  rolesJson?: string;
  status?: "active" | "suspended" | "deleted";
};

type OrganizerDocument = Models.Document & {
  tenantId?: string;
  ownerUserId?: string;
  isActive?: boolean;
};

export type PlatformActorContext = {
  appwriteUserId: string;
  roles: PlatformRole[];
  isPlatformAdmin: boolean;
  organizerId?: string;
  tenantId?: string;
};

function normalizeRequiredText(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new HttpError(`${fieldName} is required.`, 400);
  }

  return normalized;
}

function toRoleSet(input: unknown): PlatformRole[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowedRoles = new Set<PlatformRole>(["player", "organizer", "admin"]);
  const roles: PlatformRole[] = [];
  for (const value of input) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toLowerCase() as PlatformRole;
    if (!allowedRoles.has(normalized) || roles.includes(normalized)) {
      continue;
    }

    roles.push(normalized);
  }

  return roles;
}

function parseRolesJson(rolesJson: string | undefined): PlatformRole[] {
  if (!rolesJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(rolesJson);
    return toRoleSet(parsed);
  } catch {
    throw new HttpError("Platform user rolesJson is invalid.", 500);
  }
}

export async function getPlatformUserRolesByAppwriteId(
  appwriteUserId: string,
): Promise<PlatformRole[]> {
  const normalizedUserId = normalizeRequiredText(appwriteUserId, "appwriteUserId");
  const databases = getAppwriteDatabases();
  const { databaseId, usersCollectionId } = getAppwriteCollections();

  const users = await databases.listDocuments<PlatformUserDocument>(
    databaseId,
    usersCollectionId,
    [Query.equal("appwriteUserId", normalizedUserId), Query.limit(2)],
  );

  if (users.documents.length === 0) {
    return [];
  }

  if (users.documents.length > 1) {
    throw new HttpError("Duplicate platform users found for appwriteUserId.", 500);
  }

  const userDocument = users.documents[0];
  if (userDocument.status === "suspended" || userDocument.status === "deleted") {
    throw new HttpError("User is not active.", 403);
  }

  return parseRolesJson(userDocument.rolesJson);
}

export async function getPrimaryOrganizerScopeForUser(
  ownerUserId: string,
): Promise<{ organizerId: string; tenantId: string } | null> {
  const normalizedOwnerUserId = normalizeRequiredText(ownerUserId, "ownerUserId");
  const databases = getAppwriteDatabases();
  const { databaseId, organizersCollectionId } = getAppwriteCollections();

  const organizers = await databases.listDocuments<OrganizerDocument>(
    databaseId,
    organizersCollectionId,
    [
      Query.equal("ownerUserId", normalizedOwnerUserId),
      Query.equal("isActive", true),
      Query.orderAsc("$createdAt"),
      Query.limit(1),
    ],
  );

  if (organizers.documents.length === 0) {
    return null;
  }

  const organizerDocument = organizers.documents[0];
  const tenantId = organizerDocument.tenantId?.trim();
  if (!tenantId) {
    throw new HttpError("Organizer is missing tenantId.", 500);
  }

  return {
    organizerId: organizerDocument.$id,
    tenantId,
  };
}

export async function buildPlatformActorContext(input: {
  appwriteUserId: string;
  isPlatformAdmin: boolean;
}): Promise<PlatformActorContext> {
  const normalizedUserId = normalizeRequiredText(input.appwriteUserId, "appwriteUserId");
  const [storedRoles, organizerScope] = await Promise.all([
    getPlatformUserRolesByAppwriteId(normalizedUserId),
    getPrimaryOrganizerScopeForUser(normalizedUserId),
  ]);

  const roles = [...storedRoles];
  if (input.isPlatformAdmin && !roles.includes("admin")) {
    roles.push("admin");
  }
  if (organizerScope && !roles.includes("organizer")) {
    roles.push("organizer");
  }
  if (roles.length === 0) {
    roles.push("player");
  }

  return {
    appwriteUserId: normalizedUserId,
    roles,
    isPlatformAdmin: input.isPlatformAdmin,
    organizerId: organizerScope?.organizerId,
    tenantId: organizerScope?.tenantId,
  };
}
