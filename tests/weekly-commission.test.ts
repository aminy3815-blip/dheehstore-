import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateCommissionAmount,
  calculateDiscountedLineSaleSantim,
  calculateRefundCommissionCredit,
  calculateWeeklyCommission,
  deriveWeeklyCommissionStatus,
  getAddisWeekPeriod,
  getAddisWeekStart,
  isWeeklyCommissionEligible,
} from '../src/lib/weekly-commission';

test('charges exactly 3% of discounted product selling price in integer santim', () => {
  const firstLine = calculateDiscountedLineSaleSantim(1000, 1, 1000);
  const secondLine = calculateDiscountedLineSaleSantim(250, 1, 0);
  assert.equal(firstLine, 99000);
  assert.equal(calculateWeeklyCommission(firstLine), 2970);
  assert.equal(calculateWeeklyCommission(secondLine), 750);
  assert.equal(calculateWeeklyCommission(firstLine + secondLine), 3720);
});

test('commission is based on sale price even when product cost is higher and is zero for a zero sale', () => {
  assert.equal(calculateWeeklyCommission(5000), 150);
  assert.equal(calculateWeeklyCommission(0), 0);
});

test('discounted line arithmetic rejects invalid quantities and excess discounts', () => {
  assert.throws(() => calculateDiscountedLineSaleSantim(100, 0, 0), /Quantity must be greater/);
  assert.throws(() => calculateDiscountedLineSaleSantim(100, 1, 10001), /Discount cannot exceed/);
});

test('Addis business week changes at Monday 00:00 and deadline is following Monday 23:59:59', () => {
  const sunday = getAddisWeekStart(new Date('2026-11-15T20:59:59.000Z'));
  const monday = getAddisWeekStart(new Date('2026-11-15T21:00:00.000Z'));
  assert.equal(sunday.toISOString(), '2026-11-08T21:00:00.000Z');
  assert.equal(monday.toISOString(), '2026-11-15T21:00:00.000Z');
  const period = getAddisWeekPeriod(monday);
  assert.equal(period.end.toISOString(), '2026-11-22T21:00:00.000Z');
  assert.equal(period.deadline.toISOString(), '2026-11-23T20:59:59.000Z');
});

test('partial refunds reverse commission proportionally and a full refund reverses it exactly once', () => {
  const first = calculateRefundCommissionCredit(10000, 300, 0, 3333);
  const second = calculateRefundCommissionCredit(10000, 300, first.cumulativeRefundSantim, 3333);
  const final = calculateRefundCommissionCredit(10000, 300, second.cumulativeRefundSantim, 3334);
  assert.deepEqual([first.creditSantim, second.creditSantim, final.creditSantim], [100, 100, 100]);
  assert.equal(final.cumulativeRefundSantim, 10000);
  assert.throws(() => calculateRefundCommissionCredit(10000, 300, 10000, 1), /exceeds/);
});

test('confirmed payments and refund credits allocate oldest balances first and preserve excess credits', () => {
  assert.deepEqual(allocateCommissionAmount([900, 500], 600), {
    allocations: [600, 0],
    unallocatedSantim: 0,
  });
  assert.deepEqual(allocateCommissionAmount([300, 500], 700), {
    allocations: [300, 400],
    unallocatedSantim: 0,
  });
  assert.deepEqual(allocateCommissionAmount([100], 150), {
    allocations: [100],
    unallocatedSantim: 50,
  });
});

test('status reflects pending verification, payment, rejection, and overdue states', () => {
  const now = new Date('2026-11-23T21:00:00.000Z');
  const deadline = new Date('2026-11-23T20:59:59.000Z');
  const base = { outstandingSantim: 100, deadline, now, hasPendingSubmission: false };
  assert.equal(deriveWeeklyCommissionStatus({ ...base, hasPendingSubmission: true }), 'AWAITING_VERIFICATION');
  assert.equal(deriveWeeklyCommissionStatus({ ...base, latestSubmissionStatus: 'REJECTED' }), 'OVERDUE');
  assert.equal(deriveWeeklyCommissionStatus({ ...base, now: new Date('2026-11-23T20:59:59.000Z'), latestSubmissionStatus: 'REJECTED' }), 'REJECTED');
  assert.equal(deriveWeeklyCommissionStatus({ ...base, outstandingSantim: 0 }), 'PAID');
});

test('only paid and delivered orders are eligible for commission', () => {
  assert.equal(isWeeklyCommissionEligible({ paymentStatus: 'PAID', orderStatus: 'DELIVERED' }), true);
  assert.equal(isWeeklyCommissionEligible({ paymentStatus: 'PENDING', orderStatus: 'DELIVERED' }), false);
  assert.equal(isWeeklyCommissionEligible({ paymentStatus: 'PAID', orderStatus: 'CANCELLED' }), false);
  assert.equal(isWeeklyCommissionEligible({ paymentStatus: 'FAILED', orderStatus: 'DELIVERED' }), false);
});
