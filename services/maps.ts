import "server-only";

import { AppwriteException, Query, type Models } from "node-appwrite";

import { getAppwriteCollections, getAppwriteDatabases } from "@/lib/appwrite/server";
import { mapRecordSchema } from "@/lib/domain/schemas";
import type { MapRecord } from "@/lib/domain/types";
import { HttpError } from "@/lib/errors/http-error";

type MapDocument = Models.Document & {
  key?: string;
  name?: string;
  sortOrder?: number;
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

function mapMapDocument(document: MapDocument): MapRecord {
  const parsed = mapRecordSchema.safeParse({
    id: document.$id,
    key: document.key,
    name: document.name,
    sortOrder: document.sortOrder,
    isActive: document.isActive,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues.at(0);
    throw new HttpError(issue?.message ?? "Map record has an invalid shape.", 500);
  }

  return {
    ...parsed.data,
    createdAt: document.$createdAt ?? null,
    updatedAt: document.$updatedAt ?? null,
  };
}

export async function listMaps(options?: {
  activeOnly?: boolean;
  limit?: number;
}): Promise<MapRecord[]> {
  const databases = getAppwriteDatabases();
  const { databaseId, mapsCollectionId } = getAppwriteCollections();
  const limit = options?.limit ?? 100;

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError("Limit must be an integer between 1 and 200.", 400);
  }

  try {
    const queries = [Query.orderAsc("sortOrder"), Query.limit(limit)];

    if (options?.activeOnly ?? true) {
      queries.unshift(Query.equal("isActive", true));
    }

    const page = await databases.listDocuments<MapDocument>(
      databaseId,
      mapsCollectionId,
      queries,
    );

    return page.documents.map(mapMapDocument);
  } catch (error) {
    throw normalizeServiceError(error);
  }
}
