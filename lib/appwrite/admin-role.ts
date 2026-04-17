import "server-only";

import { Query, Users } from "node-appwrite";

import type { AdminAuthSession } from "@/lib/appwrite/auth-session";
import { getAppwriteServerEnv } from "@/lib/appwrite/env";
import { getAppwriteServerClient } from "@/lib/appwrite/server";

export function getAdminTeamIds(): string[] {
  return getAppwriteServerEnv().APPWRITE_ADMIN_TEAM_IDS;
}

export async function isAdminUserId(userId: string): Promise<boolean> {
  const adminTeamIds = getAdminTeamIds();
  if (adminTeamIds.length === 0) {
    return false;
  }

  try {
    const users = new Users(getAppwriteServerClient());
    const memberships = await users.listMemberships({
      userId,
      queries: [
        Query.equal("teamId", adminTeamIds),
        Query.equal("confirm", true),
        Query.limit(1),
      ],
      total: false,
    });

    return memberships.memberships.length > 0;
  } catch {
    return false;
  }
}

export async function isAdminAuthSession(
  auth: AdminAuthSession,
): Promise<boolean> {
  return isAdminUserId(auth.user.$id);
}
