import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  Account,
  AppwriteException,
  Client,
  Models,
  Users,
} from "node-appwrite";

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

export class MissingAdminSessionSecretError extends Error {
  constructor() {
    super(
      "Failed to create admin session secret. Ensure Appwrite API key scopes support session creation for admin login.",
    );
    this.name = "MissingAdminSessionSecretError";
  }
}

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

type ParsedAdminSessionCookie = {
  sessionToken: string;
  userIdHint: string | null;
};

function parseAdminSessionCookieValue(value: string): ParsedAdminSessionCookie {
  const sessionToken = value.trim();

  if (!sessionToken) {
    return { sessionToken: "", userIdHint: null };
  }

  try {
    const decoded = Buffer.from(sessionToken, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as { id?: unknown; secret?: unknown };
    if (
      typeof payload.id === "string" &&
      payload.id.trim().length > 0 &&
      typeof payload.secret === "string" &&
      payload.secret.trim().length > 0
    ) {
      return {
        sessionToken,
        userIdHint: payload.id.trim(),
      };
    }
  } catch {
    // Non-encoded cookie values are still valid session tokens.
  }

  return { sessionToken, userIdHint: null };
}

function getAppwriteErrorText(error: AppwriteException): string {
  return `${String(error.type ?? "")} ${String(error.message ?? "")}`
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

function isInvalidCredentialsError(error: AppwriteException): boolean {
  const text = getAppwriteErrorText(error);
  return (
    text.includes("invalid credentials") ||
    text.includes("invalid email or password") ||
    text.includes("password is invalid") ||
    text.includes("password is incorrect")
  );
}

function isApiKeyScopeAuthorizationError(error: unknown): boolean {
  if (!(error instanceof AppwriteException)) {
    return false;
  }

  if (error.code !== 401 && error.code !== 403) {
    return false;
  }

  if (isInvalidCredentialsError(error)) {
    return false;
  }

  const text = getAppwriteErrorText(error);
  return (
    text.includes("missing scope") ||
    text.includes("unauthorized scope") ||
    text.includes("not authorized") ||
    text.includes("unauthorized") ||
    text.includes("api key") ||
    text.includes("permission")
  );
}

function isMoreFactorsRequiredError(error: unknown): boolean {
  if (!(error instanceof AppwriteException)) {
    return false;
  }

  const type = String(error.type ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return (
    type.includes("user_more_factors_required") ||
    message.includes("more factors required")
  );
}

async function createSessionWithUsersFallback(
  email: string,
  password: string,
): Promise<Models.Session> {
  const account = new Account(createBaseClient());
  const credentialSession = await account.createEmailPasswordSession({
    email,
    password,
  });
  const users = new Users(createApiKeyClient());

  try {
    return await users.createSession({ userId: credentialSession.userId });
  } finally {
    try {
      await users.deleteSession({
        userId: credentialSession.userId,
        sessionId: credentialSession.$id,
      });
    } catch (cleanupError) {
      console.warn(
        "Failed to delete intermediate Appwrite credential session during admin login fallback.",
        cleanupError,
      );
    }
  }
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

async function listUserMfaFactors(
  users: Users,
  userId: string,
): Promise<Models.MfaFactors | null> {
  try {
    return await users.listMFAFactors({ userId });
  } catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 401 || error.code === 403 || error.code === 404) {
        return null;
      }
    }

    throw error;
  }
}

async function getLatestUserSession(
  users: Users,
  userId: string,
): Promise<Models.Session | null> {
  const sessions = await users.listSessions({ userId, total: false });
  if (sessions.sessions.length === 0) {
    return null;
  }

  return sessions.sessions.reduce((latest, current) => {
    const latestTime = Date.parse(latest.$createdAt);
    const currentTime = Date.parse(current.$createdAt);
    return currentTime > latestTime ? current : latest;
  });
}

async function resolveSessionUserAndFactors(
  sessionAccount: Account,
  session: Models.Session,
): Promise<{
  user: Models.User<Models.Preferences>;
  factors: Models.MfaFactors | null;
}> {
  const factorsFromSession = await listAccountMfaFactors(sessionAccount);

  try {
    const user = await sessionAccount.get();
    return { user, factors: factorsFromSession };
  } catch (error) {
    if (!isMoreFactorsRequiredError(error)) {
      throw error;
    }

    const users = new Users(createApiKeyClient());
    const [fallbackUser, fallbackFactors] = await Promise.all([
      users.get({ userId: session.userId }),
      listUserMfaFactors(users, session.userId),
    ]);

    return {
      user: fallbackUser,
      factors: fallbackFactors,
    };
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
  const apiKeyAccount = new Account(createApiKeyClient());
  let session: Models.Session;

  try {
    session = await apiKeyAccount.createEmailPasswordSession({ email, password });
  } catch (error) {
    if (!isApiKeyScopeAuthorizationError(error)) {
      throw error;
    }

    session = await createSessionWithUsersFallback(email, password);
  }

  const sessionSecret =
    typeof session.secret === "string" ? session.secret.trim() : "";

  if (sessionSecret.length === 0) {
    throw new MissingAdminSessionSecretError();
  }

  const sessionAccount = createAdminSessionAccount(sessionSecret);
  const { user, factors } = await resolveSessionUserAndFactors(
    sessionAccount,
    session,
  );

  return {
    user,
    session,
    sessionSecret,
    mfa: buildAdminMfaState(user, session, factors),
  };
}

export async function getAdminAuthSession(): Promise<AdminAuthSession | null> {
  const cookieStore = await cookies();
  const parsedCookie = parseAdminSessionCookieValue(
    cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? "",
  );
  const sessionSecret = parsedCookie.sessionToken;

  if (!sessionSecret) {
    return null;
  }

  try {
    const account = createAdminSessionAccount(sessionSecret);
    let session: Models.Session | null = null;

    try {
      session = await account.getSession({ sessionId: "current" });
    } catch (error) {
      if (!isSessionAuthError(error)) {
        throw error;
      }

      if (!isMoreFactorsRequiredError(error)) {
        return null;
      }
    }

    if (session) {
      const { user, factors } = await resolveSessionUserAndFactors(
        account,
        session,
      );

      return {
        user,
        session,
        sessionSecret,
        mfa: buildAdminMfaState(user, session, factors),
      };
    }

    if (!parsedCookie.userIdHint) {
      return null;
    }

    const users = new Users(createApiKeyClient());
    const [user, factors, fallbackSession] = await Promise.all([
      users.get({ userId: parsedCookie.userIdHint }),
      listUserMfaFactors(users, parsedCookie.userIdHint),
      getLatestUserSession(users, parsedCookie.userIdHint),
    ]);

    if (!fallbackSession) {
      return null;
    }

    return {
      user,
      session: fallbackSession,
      sessionSecret,
      mfa: buildAdminMfaState(user, fallbackSession, factors),
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
