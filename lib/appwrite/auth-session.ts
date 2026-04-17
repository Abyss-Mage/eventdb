import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Account, AppwriteException, Client, Models } from "node-appwrite";

import { getAppwriteServerEnv } from "@/lib/appwrite/env";

export const ADMIN_SESSION_COOKIE_NAME = "admin_appwrite_session";
export const ADMIN_MFA_TOTP_FACTOR = "totp";

export type AdminMfaState = {
  required: true;
  verified: boolean;
  totpEnrolled: boolean;
  setupRequired: boolean;
  challengeRequired: boolean;
  mfaEnabled: boolean;
};

export type AdminAuthSession = {
  user: Models.User<Models.Preferences>;
  session: Models.Session;
  sessionSecret: string;
  mfa: AdminMfaState;
};

function createBaseClient(): Client {
  const env = getAppwriteServerEnv();

  return new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID);
}

function createApiKeyClient(): Client {
  const env = getAppwriteServerEnv();
  return createBaseClient().setKey(env.APPWRITE_API_KEY);
}

function createSessionClient(sessionSecret: string): Client {
  return createBaseClient().setSession(sessionSecret);
}

export function createAdminSessionAccount(sessionSecret: string): Account {
  return new Account(createSessionClient(sessionSecret));
}

function isSessionAuthError(error: unknown): boolean {
  return (
    error instanceof AppwriteException &&
    (error.code === 401 || error.code === 403)
  );
}

function getCookieBase() {
  return {
    name: ADMIN_SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function parseExpireDate(value: string): Date | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function hasTotpFactor(session: Models.Session): boolean {
  return session.factors.some(
    (factor) => factor.toLowerCase() === ADMIN_MFA_TOTP_FACTOR,
  );
}

function buildAdminMfaState(
  user: Models.User<Models.Preferences>,
  session: Models.Session,
  factors: Models.MfaFactors | null,
): AdminMfaState {
  const verified = hasTotpFactor(session);
  const totpEnrolled = factors?.totp ?? verified;

  return {
    required: true,
    verified,
    totpEnrolled,
    setupRequired: !totpEnrolled,
    challengeRequired: totpEnrolled && !verified,
    mfaEnabled: user.mfa,
  };
}

async function listAccountMfaFactors(
  account: Account,
): Promise<Models.MfaFactors | null> {
  try {
    return await account.listMFAFactors();
  } catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 401 || error.code === 403 || error.code === 404) {
        return null;
      }
    }

    throw error;
  }
}

export function isAdminMfaSatisfied(mfa: AdminMfaState): boolean {
  return !mfa.setupRequired && !mfa.challengeRequired;
}

export function setAdminSessionCookie(
  response: NextResponse,
  sessionSecret: string,
  sessionExpireAt: string,
) {
  response.cookies.set({
    ...getCookieBase(),
    value: sessionSecret,
    expires: parseExpireDate(sessionExpireAt),
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    ...getCookieBase(),
    value: "",
    maxAge: 0,
  });
}

export async function createAdminEmailPasswordSession(
  email: string,
  password: string,
): Promise<AdminAuthSession> {
  const account = new Account(createApiKeyClient());
  const session = await account.createEmailPasswordSession({ email, password });
  const sessionSecret = session.secret.trim();

  if (sessionSecret.length === 0) {
    throw new Error("Failed to create admin session secret.");
  }

  const sessionAccount = createAdminSessionAccount(sessionSecret);
  const [user, factors] = await Promise.all([
    sessionAccount.get(),
    listAccountMfaFactors(sessionAccount),
  ]);

  return {
    user,
    session,
    sessionSecret,
    mfa: buildAdminMfaState(user, session, factors),
  };
}

export async function getAdminAuthSession(): Promise<AdminAuthSession | null> {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim();

  if (!sessionSecret) {
    return null;
  }

  try {
    const account = createAdminSessionAccount(sessionSecret);
    const [user, session, factors] = await Promise.all([
      account.get(),
      account.getSession({ sessionId: "current" }),
      listAccountMfaFactors(account),
    ]);

    return {
      user,
      session,
      sessionSecret,
      mfa: buildAdminMfaState(user, session, factors),
    };
  } catch (error) {
    if (isSessionAuthError(error)) {
      return null;
    }

    throw error;
  }
}

export async function revokeAdminSession(sessionSecret: string) {
  try {
    const account = createAdminSessionAccount(sessionSecret);
    await account.deleteSession({ sessionId: "current" });
  } catch (error) {
    if (isSessionAuthError(error)) {
      return;
    }

    throw error;
  }
}
