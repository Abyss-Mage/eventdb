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
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="space-y-2">
        <label htmlFor="admin-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
