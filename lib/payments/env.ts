import "server-only";

type RazorpayServerEnv = {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
};

function normalizeOptionalEnv(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function getRazorpayServerEnv(): RazorpayServerEnv {
  return {
    keyId: normalizeOptionalEnv(process.env.RAZORPAY_KEY_ID),
    keySecret: normalizeOptionalEnv(process.env.RAZORPAY_KEY_SECRET),
    webhookSecret: normalizeOptionalEnv(process.env.RAZORPAY_WEBHOOK_SECRET),
  };
}
