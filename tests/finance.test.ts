import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { assertBalancedPostings, calculateSaleAmounts } from '../src/lib/finance';
import { decryptBankingValue, encryptBankingValue } from '../src/lib/banking-crypto';
import {
  assertChapaPaymentsEnabled,
  assertChapaPayoutsEnabled,
  chapaAmountSantim,
  getChapaMode,
  verifyChapaWebhookSignature,
} from '../src/lib/chapa';
import { getFinanceRange, matchesFinanceRange } from '../src/lib/finance-report';

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('1000 ETB sale at 700 ETB cost charges 3% of 300 ETB profit', () => {
  assert.deepEqual(calculateSaleAmounts({
    unitPriceBirr: 1000,
    quantity: 1,
    unitCostSantim: 70000,
    commissionBps: 300,
  }), {
    grossSaleSantim: 100000,
    productCostSantim: 70000,
    eligibleProfitSantim: 30000,
    commissionSantim: 900,
    sellerAmountSantim: 99100,
  });
});

test('zero profit produces no commission', () => {
  const amounts = calculateSaleAmounts({ unitPriceBirr: 50, quantity: 2, unitCostSantim: 5000, commissionBps: 300 });
  assert.equal(amounts.eligibleProfitSantim, 0);
  assert.equal(amounts.commissionSantim, 0);
  assert.equal(amounts.sellerAmountSantim, 10000);
});

test('negative profit produces no commission and records the seller loss', () => {
  const amounts = calculateSaleAmounts({ unitPriceBirr: 90, quantity: 1, unitCostSantim: 10000, commissionBps: 300 });
  assert.equal(amounts.eligibleProfitSantim, 0);
  assert.equal(amounts.commissionSantim, 0);
  assert.equal(amounts.sellerAmountSantim, 9000);
});

test('discounts reduce eligible profit before the commission is calculated', () => {
  const amounts = calculateSaleAmounts({ unitPriceBirr: 100, quantity: 1, unitCostSantim: 7000, discountSantim: 1000, commissionBps: 300 });
  assert.equal(amounts.grossSaleSantim, 9000);
  assert.equal(amounts.eligibleProfitSantim, 2000);
  assert.equal(amounts.commissionSantim, 60);
});

test('multiple units multiply both sales and private product cost', () => {
  const amounts = calculateSaleAmounts({ unitPriceBirr: 100, quantity: 3, unitCostSantim: 7000, commissionBps: 300 });
  assert.equal(amounts.eligibleProfitSantim, 9000);
  assert.equal(amounts.commissionSantim, 270);
});

test('discounts cannot exceed a line sale', () => {
  assert.throws(() => calculateSaleAmounts({
    unitPriceBirr: 10,
    quantity: 1,
    unitCostSantim: 0,
    discountSantim: 1001,
    commissionBps: 300,
  }), /Discount cannot exceed/);
});

test('ledger postings must balance and each entry must be one-sided', () => {
  assert.doesNotThrow(() => assertBalancedPostings([
    { account: 'asset:cash', debitSantim: 100, creditSantim: 0 },
    { account: 'income:commission', debitSantim: 0, creditSantim: 100 },
  ]));
  assert.throws(() => assertBalancedPostings([
    { account: 'asset:cash', debitSantim: 100, creditSantim: 0 },
    { account: 'income:commission', debitSantim: 0, creditSantim: 99 },
  ]), /not balanced/);
  assert.throws(() => assertBalancedPostings([
    { account: 'invalid', debitSantim: 1, creditSantim: 1 },
  ]), /one-sided/);
});

test('ETB provider amounts convert to integer santim', () => {
  assert.equal(chapaAmountSantim('12.34'), 1234);
  assert.equal(chapaAmountSantim(12), 1200);
  assert.throws(() => chapaAmountSantim('not-an-amount'), /invalid ETB amount/);
});

test('webhook signature validation accepts documented headers and rejects altered payloads', () => {
  const secret = randomBytes(32).toString('hex');
  withEnvironment({
    CHAPA_MODE: 'test',
    CHAPA_TEST_WEBHOOK_SECRET: secret,
    CHAPA_WEBHOOK_SECRET: undefined,
    NODE_ENV: 'development',
    VERCEL_ENV: undefined,
  }, () => {
    const body = '{"event":"charge.success","tx_ref":"test-1"}';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    const chapaSignature = createHmac('sha256', secret).update(secret).digest('hex');
    const canonicalSignature = createHmac('sha256', secret)
      .update(JSON.stringify(JSON.parse(`{ "event": "charge.success", "tx_ref": "test-1" }`)))
      .digest('hex');
    assert.equal(verifyChapaWebhookSignature(body, null, signature), true);
    assert.equal(verifyChapaWebhookSignature(body, chapaSignature, null), true);
    assert.equal(verifyChapaWebhookSignature('{ "event": "charge.success", "tx_ref": "test-1" }', null, canonicalSignature), true);
    assert.equal(verifyChapaWebhookSignature(body.replace('test-1', 'test-2'), null, signature), false);
  });
});

test('live Chapa payments and payouts remain disabled until explicitly enabled', () => {
  withEnvironment({
    CHAPA_MODE: 'live',
    CHAPA_LIVE_SECRET_KEY: 'CHASECK-LIVE-TEST-KEY',
    CHAPA_LIVE_PAYMENTS_ENABLED: undefined,
    CHAPA_LIVE_PAYOUTS_ENABLED: undefined,
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
  }, () => {
    assert.throws(assertChapaPaymentsEnabled, /Live Chapa payments are disabled/);
    assert.throws(assertChapaPayoutsEnabled, /Live Chapa payouts are disabled/);
  });
});

test('test mode cannot use a live-only secret key', () => {
  withEnvironment({
    CHAPA_MODE: 'test',
    CHAPA_TEST_SECRET_KEY: undefined,
    CHAPA_LIVE_SECRET_KEY: 'CHASECK-LIVE-TEST-KEY',
    CHAPA_SECRET_KEY: undefined,
    NODE_ENV: 'development',
    VERCEL_ENV: undefined,
  }, () => {
    assert.throws(assertChapaPaymentsEnabled, /Chapa test mode is not configured/);
  });
});

test('live Chapa mode cannot run in a Vercel preview deployment', () => {
  withEnvironment({
    CHAPA_MODE: 'live',
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
  }, () => {
    assert.throws(getChapaMode, /only available in the production deployment/);
  });
});

test('banking details are authenticated-encrypted and tampering is rejected', () => {
  const previous = process.env.BANKING_ENCRYPTION_KEY;
  process.env.BANKING_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const encrypted = encryptBankingValue('123456789');
  assert.notEqual(encrypted, '123456789');
  assert.equal(decryptBankingValue(encrypted), '123456789');
  const [iv, tag, cipher] = encrypted.split(':');
  assert.throws(() => decryptBankingValue(`${iv}:${tag}:${cipher.slice(0, -2)}00`));
  if (previous === undefined) delete process.env.BANKING_ENCRYPTION_KEY;
  else process.env.BANKING_ENCRYPTION_KEY = previous;
});

test('custom financial report ranges include both requested dates', () => {
  const range = getFinanceRange('custom', '2026-01-02', '2026-01-04');
  assert.equal(matchesFinanceRange(new Date('2026-01-01T21:00:00.000Z'), range), true);
  assert.equal(matchesFinanceRange(new Date('2026-01-02T00:00:00.000Z'), range), true);
  assert.equal(matchesFinanceRange(new Date('2026-01-04T20:59:59.000Z'), range), true);
  assert.equal(matchesFinanceRange(new Date('2026-01-04T21:00:00.000Z'), range), false);
});

test('invalid custom report ranges are rejected', () => {
  assert.throws(() => getFinanceRange('custom', undefined, '2026-01-04'), /requires both/);
  assert.throws(() => getFinanceRange('custom', '2026-01-05', '2026-01-04'), /invalid/);
});

test('calendar financial filters use Africa/Addis_Ababa month and year boundaries', () => {
  const now = new Date('2026-03-01T21:00:00.000Z');
  assert.equal(getFinanceRange('month', undefined, undefined, now).from?.toISOString(), '2026-02-28T21:00:00.000Z');
  assert.equal(getFinanceRange('year', undefined, undefined, now).from?.toISOString(), '2025-12-31T21:00:00.000Z');
});
