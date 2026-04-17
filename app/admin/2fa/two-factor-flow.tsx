"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_ROUTES, DASHBOARD_ROUTES } from "@/app/admin/admin-routes";

type AdminMfaState = {
  required: true;
  verified: boolean;
  totpEnrolled: boolean;
  setupRequired: boolean;
  challengeRequired: boolean;
  mfaEnabled: boolean;
};

type ApiFailure = {
  success: false;
  error: string;
};

type EnrollStartResponse =
  | {
      success: true;
      data: {
        type: "totp";
        secret: string;
        uri: string;
      };
    }
  | ApiFailure;

type EnrollVerifyResponse =
  | {
      success: true;
      data: {
        verified: true;
        recoveryCodes: string[];
        mfa: AdminMfaState;
      };
    }
  | ApiFailure;

type ChallengeCreateResponse =
  | {
      success: true;
      data:
        | {
            challengeId: string;
            expire: string;
            factor: "totp";
          }
        | {
            verified: true;
            challengeRequired: false;
          };
    }
  | ApiFailure;

type ChallengeVerifyResponse =
  | {
      success: true;
      data: {
        verified: true;
        session: {
          id: string;
          expire: string;
          factors: string[];
          mfaUpdatedAt: string;
        };
        mfa: AdminMfaState;
      };
    }
  | ApiFailure;

type RecoveryCodesResponse =
  | {
      success: true;
      data: {
        recoveryCodes: string[];
      };
    }
  | ApiFailure;

type AdminTwoFactorFlowProps = {
  email: string;
  initialMfaState: AdminMfaState;
};

export function AdminTwoFactorFlow({
  email,
  initialMfaState,
}: AdminTwoFactorFlowProps) {
  const router = useRouter();

  const [mfaState, setMfaState] = useState(initialMfaState);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  const [qrErrorMessage, setQrErrorMessage] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [enrollmentOtp, setEnrollmentOtp] = useState("");
  const [challengeOtp, setChallengeOtp] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function handleUnauthorized(status: number) {
    if (status === 401) {
      router.push(ADMIN_ROUTES.login);
      router.refresh();
    }
  }

  function updateMfaState(next: AdminMfaState) {
    setMfaState(next);

    if (!next.setupRequired && !next.challengeRequired) {
      router.push(DASHBOARD_ROUTES.overview);
      router.refresh();
    }
  }

  useEffect(() => {
    let disposed = false;

    async function buildQrCode(uri: string) {
      try {
        if (!disposed) {
          setTotpQrDataUrl(null);
          setQrErrorMessage(null);
        }
        const { toDataURL } = await import("qrcode");
        const dataUrl = await toDataURL(uri, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 240,
        });

        if (!disposed) {
          setTotpQrDataUrl(dataUrl);
        }
      } catch {
        if (!disposed) {
          setTotpQrDataUrl(null);
          setQrErrorMessage(
            "Unable to generate QR code. Use the TOTP URI or manual setup secret.",
          );
        }
      }
    }

    if (!totpUri) {
      return () => {
        disposed = true;
      };
    }

    void buildQrCode(totpUri);

    return () => {
      disposed = true;
    };
  }, [totpUri]);

  async function startEnrollment() {
    setIsBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth/mfa/enroll", {
        method: "POST",
      });
      const body = (await response.json()) as EnrollStartResponse;

      if (!body.success) {
        handleUnauthorized(response.status);
        setErrorMessage(body.error);
        return;
      }

      setTotpSecret(body.data.secret);
      setTotpUri(body.data.uri);
      setMessage("Authenticator created. Add it to your app and verify with OTP.");
    } catch {
      setErrorMessage("Unable to start TOTP enrollment.");
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth/mfa/enroll/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: enrollmentOtp }),
      });
      const body = (await response.json()) as EnrollVerifyResponse;

      if (!body.success) {
        handleUnauthorized(response.status);
        setErrorMessage(body.error);
        return;
      }

      setRecoveryCodes(body.data.recoveryCodes);
      setEnrollmentOtp("");
      setMessage(
        body.data.mfa.challengeRequired
          ? "TOTP setup complete. Complete MFA challenge to continue."
          : "TOTP setup complete.",
      );
      updateMfaState(body.data.mfa);
    } catch {
      setErrorMessage("Unable to verify enrollment OTP.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createChallenge() {
    setIsBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth/mfa/challenge", {
        method: "POST",
      });
      const body = (await response.json()) as ChallengeCreateResponse;

      if (!body.success) {
        handleUnauthorized(response.status);
        setErrorMessage(body.error);
        return;
      }

      if ("challengeId" in body.data) {
        setChallengeId(body.data.challengeId);
        setMessage("Challenge created. Enter the current OTP from your authenticator.");
      } else {
        router.push(DASHBOARD_ROUTES.overview);
        router.refresh();
      }
    } catch {
      setErrorMessage("Unable to create MFA challenge.");
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);
    setMessage(null);

    if (!challengeId) {
      setErrorMessage("Create a challenge first.");
      setIsBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp: challengeOtp }),
      });
      const body = (await response.json()) as ChallengeVerifyResponse;

      if (!body.success) {
        handleUnauthorized(response.status);
        setErrorMessage(body.error);
        return;
      }

      setChallengeOtp("");
      setChallengeId(null);
      setMessage("MFA challenge verified.");
      updateMfaState(body.data.mfa);
    } catch {
      setErrorMessage("Unable to verify MFA challenge.");
    } finally {
      setIsBusy(false);
    }
  }

  async function loadRecoveryCodes() {
    setIsBusy(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth/mfa/recovery-codes", {
        method: "GET",
      });
      const body = (await response.json()) as RecoveryCodesResponse;

      if (!body.success) {
        handleUnauthorized(response.status);
        setErrorMessage(body.error);
        return;
      }

      setRecoveryCodes(body.data.recoveryCodes);
    } catch {
      setErrorMessage("Unable to load recovery codes.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Continuing as <span className="font-medium break-all">{email}</span>
      </p>

      {mfaState.setupRequired ? (
        <div className="space-y-4">
          <h2 className="type-title">Set up TOTP</h2>
          <p className="text-sm text-muted">
            Add a TOTP authenticator app, then enter the 6-digit OTP.
          </p>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void startEnrollment()}
            className="btn-base btn-secondary w-full"
          >
            {totpSecret ? "Regenerate TOTP Secret" : "Create TOTP Authenticator"}
          </button>

          {totpUri ? (
            <div className="space-y-2">
              <label className="field-label">Scan QR in Authenticator</label>
              <div className="surface-base surface-subtle inline-flex p-2">
                {totpQrDataUrl ? (
                  <Image
                    src={totpQrDataUrl}
                    alt="TOTP QR code for authenticator setup"
                    width={220}
                    height={220}
                    unoptimized
                  />
                ) : (
                  <p className="px-4 py-8 text-xs text-muted">Generating QR code...</p>
                )}
              </div>
              {qrErrorMessage ? (
                <p className="text-xs text-accent">{qrErrorMessage}</p>
              ) : null}
              <label className="field-label">TOTP URI</label>
              <textarea
                readOnly
                value={totpUri}
                className="textarea-control h-24 text-xs"
              />
            </div>
          ) : null}

          {totpSecret ? (
            <div className="space-y-2">
              <label className="field-label">Manual setup secret</label>
              <input
                readOnly
                value={totpSecret}
                className="input-control"
              />
            </div>
          ) : null}

          <form onSubmit={(event) => void verifyEnrollment(event)} className="space-y-2">
            <label htmlFor="setup-otp" className="field-label">
              Verification OTP
            </label>
            <input
              id="setup-otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={enrollmentOtp}
              onChange={(event) => setEnrollmentOtp(event.target.value)}
              required
              className="input-control"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="btn-base btn-primary w-full"
            >
              Verify TOTP Setup
            </button>
          </form>
        </div>
      ) : null}

      {!mfaState.setupRequired && mfaState.challengeRequired ? (
        <div className="space-y-4">
          <h2 className="type-title">Verify TOTP Challenge</h2>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void createChallenge()}
            className="btn-base btn-secondary w-full"
          >
            {challengeId ? "Regenerate Challenge" : "Create Challenge"}
          </button>

          <form onSubmit={(event) => void verifyChallenge(event)} className="space-y-2">
            <label htmlFor="challenge-otp" className="field-label">
              Challenge OTP
            </label>
            <input
              id="challenge-otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={challengeOtp}
              onChange={(event) => setChallengeOtp(event.target.value)}
              required
              className="input-control"
            />
            <button
              type="submit"
              disabled={isBusy || !challengeId}
              className="btn-base btn-primary w-full"
            >
              Verify Challenge
            </button>
          </form>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-label">Recovery Codes</h2>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void loadRecoveryCodes()}
            className="btn-base btn-ghost px-3 py-1 text-xs"
          >
            Load Codes
          </button>
        </div>
        {recoveryCodes.length > 0 ? (
          <ul className="surface-base surface-subtle grid grid-cols-1 gap-2 p-3 font-mono text-xs sm:grid-cols-2">
            {recoveryCodes.map((code) => (
              <li key={code} className="break-all">
                {code}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No recovery codes loaded yet.</p>
        )}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
    </div>
  );
}
