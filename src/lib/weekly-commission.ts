import { CommissionSubmissionStatus, Prisma, WeeklyCommissionStatus } from '@prisma/client';
import { assertBalancedPostings, type Posting } from './finance';

type TransactionClient = Prisma.TransactionClient;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_SANTIM = 2147483647;

function roundedRatio(numerator: bigint, denominator: bigint) {
  const result = (numerator + denominator / BigInt(2)) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Commission exceeds the supported amount.');
  return Number(result);
}

async function createCommissionLedgerEntry(tx: TransactionClient, input: {
  orderId?: string;
  shopId: string;
  productId?: string;
  kind: string;
  reference: string;
  reversesReference?: string;
  saleSantim?: number;
  commissionSantim: number;
  refundSantim?: number;
  settlementStatus?: 'PENDING' | 'AVAILABLE' | 'SETTLED';
  postings: Posting[];
}) {
  if (!input.commissionSantim) return;
  assertBalancedPostings(input.postings);
  const existing = await tx.financialTransaction.findUnique({ where: { reference: input.reference } });
  if (existing) return existing;
  const reverses = input.reversesReference
    ? await tx.financialTransaction.findUniqueOrThrow({ where: { reference: input.reversesReference }, select: { id: true } })
    : null;
  return tx.financialTransaction.create({
    data: {
      ...(input.orderId ? { order: { connect: { id: input.orderId } } } : {}),
      seller: { connect: { id: input.shopId } },
      ...(input.productId ? { productId: input.productId } : {}),
      kind: input.kind,
      reference: input.reference,
      ...(reverses ? { reverses: { connect: { id: reverses.id } } } : {}),
      grossSaleSantim: input.saleSantim ?? 0,
      commissionSantim: input.commissionSantim,
      refundSantim: input.refundSantim ?? 0,
      settlementStatus: input.settlementStatus ?? 'PENDING',
      postings: { create: input.postings },
    },
  });
}

function addisDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  const weekday = part('weekday');
  if (!year || !month || !day || !weekday) throw new Error('Unable to determine the Addis Ababa business date.');
  return { year, month, day, weekday };
}

export function getAddisWeekStart(value: Date) {
  const { year, month, day, weekday } = addisDateParts(value);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  if (weekdayIndex < 0) throw new Error('Unable to determine the Addis Ababa weekday.');
  const daysSinceMonday = (weekdayIndex + 6) % 7;
  return new Date(Date.UTC(year, month - 1, day - daysSinceMonday) - ADDIS_OFFSET_MS);
}

export function getAddisWeekPeriod(periodStart: Date) {
  const start = getAddisWeekStart(periodStart);
  const end = new Date(start.getTime() + WEEK_MS);
  return {
    start,
    end,
    deadline: new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1000),
  };
}

export function calculateWeeklyCommission(saleSantim: number) {
  if (!Number.isSafeInteger(saleSantim) || saleSantim < 0) throw new RangeError('Sale amount must be a non-negative safe integer.');
  return roundedRatio(BigInt(saleSantim) * BigInt(300), BigInt(10000));
}

export function calculateDiscountedLineSaleSantim(unitPriceBirr: number, quantity: number, discountSantim: number) {
  for (const [name, value] of Object.entries({ unitPriceBirr, quantity, discountSantim })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  if (quantity === 0) throw new RangeError('Quantity must be greater than zero.');
  const grossSantim = unitPriceBirr * 100 * quantity;
  if (!Number.isSafeInteger(grossSantim) || grossSantim > MAX_SANTIM || discountSantim > grossSantim) {
    throw new RangeError('Discount cannot exceed the product line selling price.');
  }
  return grossSantim - discountSantim;
}

export function allocateCommissionAmount(outstandingByPeriod: number[], amountSantim: number) {
  if (!Number.isSafeInteger(amountSantim) || amountSantim < 0 ||
    outstandingByPeriod.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new RangeError('Commission allocation amounts must be non-negative safe integers.');
  }
  let remaining = amountSantim;
  const allocations = outstandingByPeriod.map((outstanding) => {
    const amount = Math.min(outstanding, remaining);
    remaining -= amount;
    return amount;
  });
  return { allocations, unallocatedSantim: remaining };
}

export function isWeeklyCommissionEligible(input: { paymentStatus: string; orderStatus: string }) {
  return input.paymentStatus === 'PAID' && input.orderStatus === 'DELIVERED';
}

export function calculateRefundCommissionCredit(
  saleSantim: number,
  commissionSantim: number,
  previouslyRefundedSantim: number,
  refundSantim: number,
) {
  for (const [name, value] of Object.entries({ saleSantim, commissionSantim, previouslyRefundedSantim, refundSantim })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  if (saleSantim <= 0 || previouslyRefundedSantim + refundSantim > saleSantim) {
    throw new RangeError('Refund exceeds the remaining eligible product sale amount.');
  }
  const cumulativeRefund = previouslyRefundedSantim + refundSantim;
  if (!Number.isSafeInteger(cumulativeRefund)) throw new RangeError('Refund exceeds the supported amount.');
  const creditSantim =
    roundedRatio(BigInt(commissionSantim) * BigInt(cumulativeRefund), BigInt(saleSantim)) -
    roundedRatio(BigInt(commissionSantim) * BigInt(previouslyRefundedSantim), BigInt(saleSantim));
  return { cumulativeRefundSantim: cumulativeRefund, creditSantim };
}

export function deriveWeeklyCommissionStatus(input: {
  outstandingSantim: number;
  deadline: Date;
  now: Date;
  hasPendingSubmission: boolean;
  latestSubmissionStatus?: CommissionSubmissionStatus;
}): WeeklyCommissionStatus {
  if (input.outstandingSantim <= 0) return 'PAID';
  if (input.hasPendingSubmission) return 'AWAITING_VERIFICATION';
  if (input.now > input.deadline) return 'OVERDUE';
  if (input.latestSubmissionStatus === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

async function updateStatementStatus(tx: TransactionClient, statementId: string, now: Date) {
  const statement = await tx.weeklyCommissionStatement.findUniqueOrThrow({ where: { id: statementId } });
  const [paid, credited, pending, latest] = await Promise.all([
    tx.commissionPaymentAllocation.aggregate({ where: { statementId }, _sum: { amountSantim: true } }),
    tx.commissionCreditAllocation.aggregate({ where: { statementId }, _sum: { amountSantim: true } }),
    tx.commissionPaymentSubmission.count({
      where: { shopId: statement.shopId, status: { in: ['PENDING', 'AWAITING_VERIFICATION'] } },
    }),
    tx.commissionPaymentSubmission.findFirst({ where: { shopId: statement.shopId }, orderBy: { createdAt: 'desc' }, select: { status: true } }),
  ]);
  const outstandingSantim = Math.max(0, statement.commissionSantim - (paid._sum.amountSantim || 0) - (credited._sum.amountSantim || 0));
  const status = deriveWeeklyCommissionStatus({
    outstandingSantim,
    deadline: statement.deadline,
    now,
    hasPendingSubmission: pending > 0,
    latestSubmissionStatus: latest?.status,
  });
  await tx.weeklyCommissionStatement.update({ where: { id: statementId }, data: { status } });
  return outstandingSantim;
}

export async function ensureCommissionStatements(tx: TransactionClient, shopId: string, now = new Date()) {
  const salesPeriods = await tx.commissionSale.findMany({
    where: { shopId, periodStart: { lte: now } },
    distinct: ['periodStart'],
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true },
  });
  const periodStarts = [...new Map(
    [...salesPeriods.map(({ periodStart }) => periodStart), getAddisWeekStart(now)]
      .map((periodStart) => [periodStart.getTime(), periodStart] as const),
  ).values()].sort((a, b) => a.getTime() - b.getTime());
  for (const periodStart of periodStarts) {
    const period = getAddisWeekPeriod(periodStart);
    const sales = await tx.commissionSale.aggregate({
      where: { shopId, periodStart },
      _sum: { saleSantim: true, commissionSantim: true },
    });
    const previous = await tx.weeklyCommissionStatement.findMany({
      where: { shopId, periodStart: { lt: period.start } },
      orderBy: { periodStart: 'asc' },
    });
    let carriedSantim = 0;
    for (const statement of previous) {
      carriedSantim += await updateStatementStatus(tx, statement.id, now);
    }
    const current = await tx.weeklyCommissionStatement.upsert({
      where: { shopId_periodStart: { shopId, periodStart: period.start } },
      create: {
          shopId,
          periodStart: period.start,
          periodEnd: period.end,
          deadline: period.deadline,
          salesSantim: sales._sum.saleSantim || 0,
          commissionSantim: sales._sum.commissionSantim || 0,
          carriedSantim,
          totalDueSantim: carriedSantim + (sales._sum.commissionSantim || 0),
      },
      update: {
          salesSantim: sales._sum.saleSantim || 0,
          commissionSantim: sales._sum.commissionSantim || 0,
          carriedSantim,
          totalDueSantim: carriedSantim + (sales._sum.commissionSantim || 0),
      },
    });
    await updateStatementStatus(tx, current.id, now);
    await applyUnallocatedCredits(tx, shopId, await tx.weeklyCommissionStatement.findMany({
      where: { shopId },
      orderBy: { periodStart: 'asc' },
    }), now);
  }
  return tx.weeklyCommissionStatement.findMany({ where: { shopId }, orderBy: { periodStart: 'desc' } });
}

export async function recordEligibleOrderCommission(tx: TransactionClient, orderId: string, eligibleAt = new Date()) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || !isWeeklyCommissionEligible({ paymentStatus: order.paymentStatus, orderStatus: order.status })) return;
  const periodStart = getAddisWeekStart(eligibleAt);
  for (const item of order.items) {
    const saleSantim = calculateDiscountedLineSaleSantim(item.unitPrice, item.quantity, item.discountSantim);
    const commissionSantim = calculateWeeklyCommission(saleSantim);
    const sale = await tx.commissionSale.upsert({
      where: { orderItemId: item.id },
      create: {
        orderId: order.id,
        orderItemId: item.id,
        shopId: order.shopId,
        productId: item.productId,
        periodStart,
        eligibleAt,
        saleSantim,
        commissionSantim,
      },
      update: {},
    });
    await createCommissionLedgerEntry(tx, {
      orderId: order.id,
      shopId: order.shopId,
      productId: item.productId,
      kind: 'WEEKLY_COMMISSION_ASSESSMENT',
      reference: `weekly-commission-sale:${item.id}`,
      saleSantim,
      commissionSantim: sale.commissionSantim,
      postings: [
        { account: `asset:commission-receivable:${order.shopId}`, debitSantim: sale.commissionSantim, creditSantim: 0 },
        { account: 'income:commission', debitSantim: 0, creditSantim: sale.commissionSantim },
      ],
    });
  }
}

async function allocateToStatements(tx: TransactionClient, statements: { id: string; periodStart: Date }[], amountSantim: number, sourceId: string, kind: 'PAYMENT' | 'REFUND', now: Date) {
  const ordered = [...statements].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const outstanding = await Promise.all(ordered.map((statement) => updateStatementStatus(tx, statement.id, now)));
  const result = allocateCommissionAmount(outstanding, amountSantim);
  for (const [index, statement] of ordered.entries()) {
    const amount = result.allocations[index];
    if (!amount) continue;
    if (kind === 'PAYMENT') {
      await tx.commissionPaymentAllocation.create({
        data: { statementId: statement.id, submissionId: sourceId, amountSantim: amount },
      });
    } else {
      await tx.commissionCreditAllocation.create({
        data: { statementId: statement.id, creditId: sourceId, amountSantim: amount },
      });
      const credit = await tx.commissionCredit.findUniqueOrThrow({ where: { id: sourceId } });
      await createCommissionLedgerEntry(tx, {
        orderId: credit.orderId,
        shopId: credit.shopId,
        kind: 'WEEKLY_COMMISSION_CREDIT_APPLIED',
        reference: `weekly-commission-credit-apply:${credit.id}:${statement.id}`,
        commissionSantim: amount,
        postings: [
          { account: `liability:commission-credit:${credit.shopId}`, debitSantim: amount, creditSantim: 0 },
          { account: `asset:commission-receivable:${credit.shopId}`, debitSantim: 0, creditSantim: amount },
        ],
      });
    }
    await updateStatementStatus(tx, statement.id, now);
  }
  if (result.unallocatedSantim > 0 && kind === 'PAYMENT') throw new Error('Payment exceeds the seller’s outstanding commission.');
}

async function applyUnallocatedCredits(tx: TransactionClient, shopId: string, statements: { id: string; periodStart: Date }[], now: Date) {
  const credits = await tx.commissionCredit.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
  for (const credit of credits) {
    const allocated = await tx.commissionCreditAllocation.aggregate({
      where: { creditId: credit.id },
      _sum: { amountSantim: true },
    });
    const remaining = credit.commissionCreditSantim - (allocated._sum.amountSantim || 0);
    if (remaining > 0) await allocateToStatements(tx, statements, remaining, credit.id, 'REFUND', now);
  }
}

async function allocateAmount(tx: TransactionClient, shopId: string, amountSantim: number, sourceId: string, kind: 'PAYMENT' | 'REFUND', now: Date) {
  if (!Number.isSafeInteger(amountSantim) || amountSantim < 0) throw new Error('Commission allocation amount is invalid.');
  const statements = await ensureCommissionStatements(tx, shopId, now);
  await allocateToStatements(tx, statements, amountSantim, sourceId, kind, now);
}

export async function confirmCommissionPayment(tx: TransactionClient, input: {
  submissionId: string;
  reviewerId: string;
  confirmedSantim: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const submission = await tx.commissionPaymentSubmission.findUniqueOrThrow({ where: { id: input.submissionId } });
  if (submission.status !== 'PENDING' && submission.status !== 'AWAITING_VERIFICATION') {
    throw new Error('This commission payment submission has already been reviewed.');
  }
  if (!Number.isSafeInteger(input.confirmedSantim) || input.confirmedSantim <= 0 || input.confirmedSantim > submission.amountSantim) {
    throw new Error('Confirmed payment must be positive and cannot exceed the submitted amount.');
  }
  await ensureCommissionStatements(tx, submission.shopId, now);
  const updated = await tx.commissionPaymentSubmission.updateMany({
    where: { id: submission.id, status: { in: ['PENDING', 'AWAITING_VERIFICATION'] } },
    data: {
      status: 'CONFIRMED',
      confirmedSantim: input.confirmedSantim,
      reviewerId: input.reviewerId,
      reviewedAt: now,
    },
  });
  if (updated.count !== 1) throw new Error('This commission payment submission has already been reviewed.');
  await allocateAmount(tx, submission.shopId, input.confirmedSantim, submission.id, 'PAYMENT', now);
  const unconfirmed = submission.amountSantim - input.confirmedSantim;
  if (unconfirmed > 0) {
    await tx.commissionPaymentSubmission.update({
      where: { id: submission.id },
      data: { rejectionReason: `Only ${input.confirmedSantim} santim was confirmed; the remaining amount was not accepted.` },
    });
  }
  return submission;
}

export async function recordCommissionCollection(tx: TransactionClient, input: {
  submissionId: string;
  reviewerId: string;
  confirmedSantim: number;
  now?: Date;
}) {
  const submission = await confirmCommissionPayment(tx, input);
  await createCommissionLedgerEntry(tx, {
    shopId: submission.shopId,
    kind: 'WEEKLY_COMMISSION_COLLECTION',
    reference: `weekly-commission-payment:${submission.id}`,
    commissionSantim: input.confirmedSantim,
    settlementStatus: 'AVAILABLE',
    postings: [
      { account: 'asset:commission-cash', debitSantim: input.confirmedSantim, creditSantim: 0 },
      { account: `asset:commission-receivable:${submission.shopId}`, debitSantim: 0, creditSantim: input.confirmedSantim },
    ],
  });
  await tx.financialWallet.upsert({
    where: { userId: input.reviewerId },
    create: { userId: input.reviewerId, availableSantim: input.confirmedSantim },
    update: { availableSantim: { increment: input.confirmedSantim } },
  });
  return submission;
}

export async function recordCommissionRefund(tx: TransactionClient, input: {
  orderId: string;
  orderItemId: string;
  refundSantim: number;
  reference: string;
  actorId: string;
  now?: Date;
}) {
  const sale = await tx.commissionSale.findUnique({ where: { orderItemId: input.orderItemId } });
  if (!sale || sale.orderId !== input.orderId) throw new Error('No eligible commission sale matches this order item.');
  const existing = await tx.commissionCredit.findUnique({ where: { reference: input.reference } });
  if (existing) {
    if (existing.saleId !== sale.id || existing.refundSantim !== input.refundSantim) {
      throw new Error('This refund reference was already used for a different refund.');
    }
    return existing;
  }
  const previous = await tx.commissionCredit.aggregate({ where: { saleId: sale.id }, _sum: { refundSantim: true, commissionCreditSantim: true } });
  const credit = calculateRefundCommissionCredit(
    sale.saleSantim,
    sale.commissionSantim,
    previous._sum.refundSantim || 0,
    input.refundSantim,
  );
  const created = await tx.commissionCredit.create({
    data: {
      shop: { connect: { id: sale.shopId } },
      order: { connect: { id: sale.orderId } },
      sale: { connect: { id: sale.id } },
      reference: input.reference,
      refundSantim: input.refundSantim,
      commissionCreditSantim: credit.creditSantim,
      actor: { connect: { id: input.actorId } },
    },
  });
  const updatedSale = await tx.commissionSale.updateMany({
    where: { id: sale.id, refundedSantim: previous._sum.refundSantim || 0 },
    data: { refundedSantim: { increment: input.refundSantim } },
  });
  if (updatedSale.count !== 1) throw new Error('This product refund was updated concurrently. Reload and retry.');
  await createCommissionLedgerEntry(tx, {
    orderId: sale.orderId,
    shopId: sale.shopId,
    productId: sale.productId,
    kind: 'WEEKLY_COMMISSION_REFUND',
    reference: `weekly-commission-refund:${created.id}`,
    reversesReference: `weekly-commission-sale:${sale.orderItemId}`,
    commissionSantim: credit.creditSantim,
    refundSantim: input.refundSantim,
    postings: [
      { account: 'contra:commission-refund', debitSantim: credit.creditSantim, creditSantim: 0 },
      { account: `liability:commission-credit:${sale.shopId}`, debitSantim: 0, creditSantim: credit.creditSantim },
    ],
  });
  await ensureCommissionStatements(tx, sale.shopId, input.now);
  return created;
}

export async function getCommissionOutstanding(tx: TransactionClient, shopId: string, now = new Date()) {
  const statements = await ensureCommissionStatements(tx, shopId, now);
  let total = 0;
  for (const statement of statements) total += await updateStatementStatus(tx, statement.id, now);
  return total;
}

