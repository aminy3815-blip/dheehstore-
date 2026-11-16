import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { assertBalancedPostings, calculateSaleAmounts } from '../src/lib/finance';
import { decryptBankingValue, encryptBankingValue } from '../src/lib/banking-crypto';
import { chapaAmountSantim, verifyChapaWebhookSignature } from '../src/lib/chapa';
import { getFinanceRange, matchesFinanceRange } from '../src/lib/finance-report';

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

test('webhook signature validation checks the raw body in constant-time comparison', () => {
  const secret = randomBytes(32).toString('hex');
  const previous = process.env.CHAPA_WEBHOOK_SECRET;
  process.env.CHAPA_WEBHOOK_SECRET = secret;
  const body = '{"event":"charge.success","tx_ref":"test-1"}';
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyChapaWebhookSignature(body, signature), true);
  assert.equal(verifyChapaWebhookSignature(`${body} `, signature), false);
  if (previous === undefined) delete process.env.CHAPA_WEBHOOK_SECRET;
  else process.env.CHAPA_WEBHOOK_SECRET = previous;
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
  assert.equal(matchesFinanceRange(new Date('2026-01-02T00:00:00.000Z'), range), true);
  assert.equal(matchesFinanceRange(new Date('2026-01-04T22:00:00.000Z'), range), true);
  assert.equal(matchesFinanceRange(new Date('2026-01-05T00:00:00.000Z'), range), false);
});

test('invalid custom report ranges are rejected', () => {
  assert.throws(() => getFinanceRange('custom', undefined, '2026-01-04'), /requires both/);
  assert.throws(() => getFinanceRange('custom', '2026-01-05', '2026-01-04'), /invalid/);
});
