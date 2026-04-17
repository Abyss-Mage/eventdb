"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_ROUTES, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";

type LoginResponse =
  | {
      success: true;
      data: {
        user: {
          id: string;
          email: string;
          name: string;
        };
        session: {
          id: string;
          expire: string;
          factors: string[];
        };
        mfa: {
          required: true;
          verified: boolean;
          totpEnrolled: boolean;
          setupRequired: boolean;
          challengeRequired: boolean;
          mfaEnabled: boolean;
        };
        nextStep: "setup_totp" | "verify_totp" | "complete";
      };
    }
  | {
      success: false;
      error: string;
    };

export function AdminLoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as LoginResponse;

      if (!body.success) {
        setErrorMessage(body.error);
        return;
      }

      if (body.data.mfa.setupRequired || body.data.mfa.challengeRequired) {
        router.push(ADMIN_ROUTES.twoFactor);
      } else {
        router.push(DASHBOARD_ROUTES.overview);
      }
      router.refresh();
    } catch {
      setErrorMessage("Unable to login right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="admin-email" className="field-label">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="input-control"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="admin-password" className="field-label">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="input-control"
        />
      </div>

      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-base btn-primary w-full"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-xs text-muted">
        After successful login, you will be routed to TOTP setup or challenge before
        dashboard access.
      </p>
    </form>
  );
}
