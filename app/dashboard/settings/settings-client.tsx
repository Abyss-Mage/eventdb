"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_ROUTES } from "@/app/admin/admin-routes";
import {
  applyAdminGuardRedirect,
  throwAdminGuardError,
} from "@/app/dashboard/admin-client-auth";

type AuthMeResponse =
  | {
      success: true;
      data: {
        authenticated: true;
        user: {
          id: string;
          email: string;
          name: string;
        };
        session: {
          id: string;
          expire: string;
          factors: string[];
          mfaUpdatedAt: string | null;
        };
        mfa: {
          required: boolean;
          verified: boolean;
          totpEnrolled: boolean;
          setupRequired: boolean;
          challengeRequired: boolean;
          mfaEnabled: boolean;
        };
      };
    }
  | {
      success: false;
      error: string;
    };

type RiotConfigResponse =
  | {
      success: true;
      data: {
        config: {
          configured: boolean;
          platformRegion: string;
          routingRegion: string;
        };
      };
    }
  | {
      success: false;
      error: string;
    };

type LogoutResponse =
  | { success: true; data: { loggedOut: true } }
  | { success: false; error: string };

type AuthMeData = Extract<AuthMeResponse, { success: true }>["data"];
type RiotConfigData = Extract<RiotConfigResponse, { success: true }>["data"]["config"];

export function SettingsClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authData, setAuthData] = useState<AuthMeData | null>(null);
  const [riotConfig, setRiotConfig] = useState<RiotConfigData | null>(null);

  const refreshSettings = useCallback(async (options?: { skipInitialState?: boolean }) => {
    if (!options?.skipInitialState) {
      setIsLoading(true);
      setErrorMessage(null);
    }

    try {
      const [authResponse, riotResponse] = await Promise.all([
        fetch("/api/admin/auth/me", { method: "GET" }),
        fetch("/api/admin/riot/config", { method: "GET" }),
      ]);

      const authBody = (await authResponse.json()) as AuthMeResponse;
      const riotBody = (await riotResponse.json()) as RiotConfigResponse;

      if (!authBody.success) {
        throwAdminGuardError(authResponse.status, authBody.error);
        throw new Error(authBody.error);
      }

      if (!riotBody.success) {
        throwAdminGuardError(riotResponse.status, riotBody.error);
        throw new Error(riotBody.error);
      }

      setAuthData(authBody.data);
      setRiotConfig(riotBody.data.config);
    } catch (error) {
      if (applyAdminGuardRedirect(router, error)) {
        return;
      }

      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to load admin settings.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const run = async () => {
      await refreshSettings({ skipInitialState: true });
    };

    void run();
  }, [refreshSettings]);

  async function logout() {
    setIsLoggingOut(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/auth/logout", { method: "POST" });
      const body = (await response.json()) as LogoutResponse;

      if (!body.success) {
        setErrorMessage(body.error);
        return;
      }

      router.push(ADMIN_ROUTES.login);
      router.refresh();
    } catch {
      setErrorMessage("Unable to logout right now.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-title">Admin Settings</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshSettings()}
            disabled={isLoading}
            className="btn-base btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => void logout()}
            className="btn-base btn-ghost px-3 py-2 text-sm"
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="status-message status-danger">
          {errorMessage}
        </p>
      ) : null}
      {isLoading ? (
        <p className="status-message status-default">
          Loading settings...
        </p>
      ) : null}
      {!isLoading && !errorMessage && !authData && !riotConfig ? (
        <p className="status-message status-default">
          No settings data is available right now.
        </p>
      ) : null}

      {authData ? (
        <article className="surface-base surface-elevated p-5">
          <h3 className="type-subtitle">Session</h3>
          <div className="mt-3 space-y-1 text-sm text-muted">
            <p>
              <span className="font-medium text-soft">User:</span> {authData.user.email}
            </p>
            <p>
              <span className="font-medium text-soft">Session ID:</span>{" "}
              <span className="font-mono text-xs">{authData.session.id}</span>
            </p>
            <p>
              <span className="font-medium text-soft">Expires:</span>{" "}
              {new Date(authData.session.expire).toLocaleString()}
            </p>
            <p>
              <span className="font-medium text-soft">MFA Enabled:</span>{" "}
              {authData.mfa.mfaEnabled ? "Yes" : "No"}
            </p>
            <p>
              <span className="font-medium text-soft">MFA Verified:</span>{" "}
              {authData.mfa.verified ? "Yes" : "No"}
            </p>
          </div>
        </article>
      ) : null}

      {riotConfig ? (
        <article className="surface-base surface-elevated p-5">
          <h3 className="type-subtitle">Riot Integration</h3>
          <div className="mt-3 space-y-1 text-sm text-muted">
            <p>
              <span className="font-medium text-soft">Configured:</span>{" "}
              {riotConfig.configured ? "Yes" : "No"}
            </p>
            <p>
              <span className="font-medium text-soft">Platform Region:</span>{" "}
              {riotConfig.platformRegion}
            </p>
            <p>
              <span className="font-medium text-soft">Routing Region:</span>{" "}
              {riotConfig.routingRegion}
            </p>
          </div>
        </article>
      ) : null}
    </section>
  );
}
