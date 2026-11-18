import { createHmac, timingSafeEqual } from 'node:crypto';

type ChapaResponse = {
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type ChapaMode = 'test' | 'live';

function configuredMode(): ChapaMode | null {
  const mode = process.env.CHAPA_MODE;
  if (mode === 'test' || mode === 'live') return mode;
  if (!mode && process.env.NODE_ENV !== 'production' &&
    (process.env.CHAPA_TEST_SECRET_KEY || process.env.CHAPA_SECRET_KEY)) return 'test';
  return null;
}

export function getChapaMode(): ChapaMode {
  const mode = configuredMode();
  if (!mode) throw new Error('Set CHAPA_MODE to test or live in the server environment.');
  if (mode === 'live' && process.env.NODE_ENV !== 'production') {
    throw new Error('Chapa live mode is only available in a production runtime.');
  }
  if (mode === 'live' && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    throw new Error('Chapa live mode is only available in the production deployment.');
  }
  if (mode === 'test' && process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV !== 'preview' && process.env.VERCEL_ENV !== 'development') {
    throw new Error('Chapa test mode is not available in the production deployment.');
  }
  if (process.env.VERCEL_ENV === 'production' && mode !== 'live') {
    throw new Error('The production deployment must use Chapa live mode.');
  }
  return mode;
}

function getChapaSecret(mode = getChapaMode()) {
  const secret = mode === 'test'
    ? process.env.CHAPA_TEST_SECRET_KEY ||
      (process.env.NODE_ENV !== 'production' ? process.env.CHAPA_SECRET_KEY : undefined)
    : process.env.CHAPA_LIVE_SECRET_KEY;
  if (!secret) {
    throw new Error(mode === 'test'
      ? 'Chapa test mode is not configured. Add CHAPA_TEST_SECRET_KEY to the server environment.'
      : 'Chapa live mode is not configured. Add CHAPA_LIVE_SECRET_KEY to the production environment.');
  }
  if (mode === 'test' && !secret.startsWith('CHASECK_TEST-')) {
    throw new Error('CHAPA_TEST_SECRET_KEY must be a Chapa test secret key.');
  }
  if (mode === 'live' && secret.startsWith('CHASECK_TEST-')) {
    throw new Error('A Chapa test secret key cannot be used in live mode.');
  }
  return secret;
}

export function hasChapaCredentials() {
  const mode = configuredMode();
  if (!mode) return false;
  const secret = mode === 'test'
    ? process.env.CHAPA_TEST_SECRET_KEY ||
      (process.env.NODE_ENV !== 'production' ? process.env.CHAPA_SECRET_KEY : undefined)
    : process.env.CHAPA_LIVE_SECRET_KEY;
  return Boolean(secret);
}

export function assertChapaPaymentsEnabled() {
  const mode = getChapaMode();
  if (mode === 'live' && process.env.CHAPA_LIVE_PAYMENTS_ENABLED !== 'true') {
    throw new Error('Live Chapa payments are disabled until explicitly enabled.');
  }
  getChapaSecret(mode);
}

export function assertChapaPayoutsEnabled() {
  const mode = getChapaMode();
  if (mode === 'live' && process.env.CHAPA_LIVE_PAYOUTS_ENABLED !== 'true') {
    throw new Error('Live Chapa payouts are disabled until credentials and merchant transfer permission are confirmed.');
  }
  getChapaSecret(mode);
}

export async function chapaRequest(path: string, init: RequestInit = {}) {
  const secret = getChapaSecret();
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

function signatureMatches(secret: string, message: string, signature: string | null) {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyChapaWebhookSignature(
  rawBody: string,
  chapaSignature: string | null,
  payloadSignature: string | null,
) {
  const mode = getChapaMode();
  const webhookSecret = mode === 'test'
    ? process.env.CHAPA_TEST_WEBHOOK_SECRET ||
      (process.env.NODE_ENV !== 'production' ? process.env.CHAPA_WEBHOOK_SECRET : undefined)
    : process.env.CHAPA_LIVE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.length < 32) {
    throw new Error(mode === 'test'
      ? 'CHAPA_TEST_WEBHOOK_SECRET must be configured with at least 32 characters.'
      : 'CHAPA_LIVE_WEBHOOK_SECRET must be configured with at least 32 characters.');
  }

  if (signatureMatches(webhookSecret, webhookSecret, chapaSignature)) return true;

  const payloads = [rawBody];
  try {
    payloads.push(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    // The raw body remains available for signature validation.
  }
  return payloads.some((payload) => signatureMatches(webhookSecret, payload, payloadSignature));
}
