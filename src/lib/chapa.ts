import { createHmac, timingSafeEqual } from 'node:crypto';

type ChapaResponse = {
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
};

function getTestSecret() {
  const secret = process.env.CHAPA_SECRET_KEY;
  if (!secret) throw new Error('Chapa is not configured. Add a sandbox secret key to the server environment.');
  if (!secret.startsWith('CHASECK_TEST-')) throw new Error('Only Chapa sandbox secret keys are enabled in this build.');
  return secret;
}

export function assertChapaTestMode() {
  getTestSecret();
}

export async function chapaRequest(path: string, init: RequestInit = {}) {
  const secret = getTestSecret();
  const response = await fetch(`https://api.chapa.co/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
  let payload: ChapaResponse;
  try {
    payload = await response.json() as ChapaResponse;
  } catch {
    throw new Error(`Chapa returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok || payload.status !== 'success') {
    throw new Error(payload.message || `Chapa request failed (HTTP ${response.status}).`);
  }
  return payload;
}

export function chapaAmountSantim(value: unknown) {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Chapa returned an invalid ETB amount.');
  const santim = Math.round(amount * 100);
  if (!Number.isSafeInteger(santim)) throw new Error('Chapa amount exceeds the supported range.');
  return santim;
}

export function verifyChapaWebhookSignature(rawBody: string, signature: string | null) {
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.length < 32) throw new Error('CHAPA_WEBHOOK_SECRET must be configured with at least 32 characters.');
  if (!signature) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
