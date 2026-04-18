import "server-only";

import { Query, type QueryTypes } from "node-appwrite";

import { HttpError } from "@/lib/errors/http-error";

export type TenantAccessScope = {
  tenantId?: string;
  organizerId?: string;
  isPlatformAdmin?: boolean;
};

export type RequiredTenantScope = {
  tenantId: string;
  organizerId: string;
  isPlatformAdmin: boolean;
};

function normalizeRequiredText(
  value: string | undefined,
  fieldName: string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new HttpError(`${fieldName} is required for tenant-scoped operations.`, 403);
  }

  return normalized;
}

export function requireTenantScope(scope: TenantAccessScope): RequiredTenantScope {
  if (scope.isPlatformAdmin) {
    return {
      tenantId: scope.tenantId?.trim() ?? "",
      organizerId: scope.organizerId?.trim() ?? "",
      isPlatformAdmin: true,
    };
  }

  return {
    tenantId: normalizeRequiredText(scope.tenantId, "tenantId"),
    organizerId: normalizeRequiredText(scope.organizerId, "organizerId"),
    isPlatformAdmin: false,
  };
}

export function createTenantScopedQueries(
  scope: TenantAccessScope,
  additionalQueries: QueryTypes[] = [],
): QueryTypes[] {
  const normalizedScope = requireTenantScope(scope);

  if (normalizedScope.isPlatformAdmin) {
    return additionalQueries;
  }

  return [
    Query.equal("tenantId", normalizedScope.tenantId),
    Query.equal("organizerId", normalizedScope.organizerId),
    ...additionalQueries,
  ];
}

export function assertTenantOwnership(
  scope: TenantAccessScope,
  record: {
    tenantId?: string;
    organizerId?: string;
  },
): void {
  const normalizedScope = requireTenantScope(scope);

  if (normalizedScope.isPlatformAdmin) {
    return;
  }

  const recordTenantId = normalizeRequiredText(record.tenantId, "record tenantId");
  const recordOrganizerId = normalizeRequiredText(
    record.organizerId,
    "record organizerId",
  );

  if (
    recordTenantId !== normalizedScope.tenantId ||
    recordOrganizerId !== normalizedScope.organizerId
  ) {
    throw new HttpError("Tenant scope mismatch for requested resource.", 403);
  }
}
