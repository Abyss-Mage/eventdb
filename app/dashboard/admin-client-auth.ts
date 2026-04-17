import { ADMIN_ROUTES } from "@/app/admin/admin-routes";

type RouterLike = {
  push: (href: string) => void;
  refresh: () => void;
};

export const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";
export const MFA_REQUIRED_CODE = "MFA_REQUIRED";

function getGuardRedirectPathForCode(code: string): string {
  return code === MFA_REQUIRED_CODE ? ADMIN_ROUTES.twoFactor : ADMIN_ROUTES.login;
}

function isMfaGuardErrorMessage(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("mfa") || normalized.includes("totp");
}

export function getAdminGuardErrorCode(
  statusCode: number,
  errorMessage: string,
): string | null {
  if (statusCode === 401) {
    return AUTH_REQUIRED_CODE;
  }

  if (statusCode === 403) {
    return isMfaGuardErrorMessage(errorMessage)
      ? MFA_REQUIRED_CODE
      : AUTH_REQUIRED_CODE;
  }

  return null;
}

export function throwAdminGuardError(statusCode: number, errorMessage: string) {
  const code = getAdminGuardErrorCode(statusCode, errorMessage);
  if (code) {
    throw new Error(code);
  }
}

export function applyAdminGuardRedirect(
  router: RouterLike,
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.message !== AUTH_REQUIRED_CODE && error.message !== MFA_REQUIRED_CODE) {
    return false;
  }

  router.push(getGuardRedirectPathForCode(error.message));
  router.refresh();
  return true;
}

export function applyAdminGuardStatusRedirect(
  router: RouterLike,
  statusCode: number,
  errorMessage: string,
): boolean {
  const code = getAdminGuardErrorCode(statusCode, errorMessage);
  if (!code) {
    return false;
  }

  router.push(getGuardRedirectPathForCode(code));
  router.refresh();
  return true;
}
