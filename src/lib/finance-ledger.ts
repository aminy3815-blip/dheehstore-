import { FinancialStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertBalancedPostings, calculateSaleAmounts, Posting } from './finance';
import { recordEligibleOrderCommission } from './weekly-commission';

type TransactionClient = Prisma.TransactionClient;

async function createTransaction(
  tx: TransactionClient,
  data: Prisma.FinancialTransactionCreateInput,
  postings: Posting[],
) {
  assertBalancedPostings(postings);
  return tx.financialTransaction.create({
    data: {
      ...data,
      postings: { create: postings },
    },
  });
}

export async function recordPaidOrder(tx: TransactionClient, orderId: string, paymentId: string | null, feeSantim = 0) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { include: { category: true } } } }, shop: true },
  });
  if (!order || order.paymentStatus !== 'PAID') throw new Error('Only verified paid orders can be posted to the financial ledger.');
  if (order.status === 'CANCELLED' || order.status === 'RETURNED') throw new Error('A cancelled or returned order cannot be posted as a new paid sale.');
  const isCod = order.paymentMethod === 'COD';
  if (order.items.some((item) => item.unitCostSantim === null)) throw new Error('A product cost snapshot is required before this paid order can be settled.');
  if (await tx.financialTransaction.findFirst({ where: { orderId, kind: 'SALE' } })) return;

  const lines = order.items.map((item) => {
    return {
      item,
      amounts: calculateSaleAmounts({
        unitPriceBirr: item.unitPrice,
        quantity: item.quantity,
        unitCostSantim: item.unitCostSantim!,
        discountSantim: item.discountSantim,
        commissionBps: 0,
      }),
    };
  });
  const deliverySantim = order.deliveryFee * 100;
  const grossTotalSantim = lines.reduce((sum, line) => sum + line.amounts.grossSaleSantim, deliverySantim);
  if (!Number.isSafeInteger(feeSantim) || feeSantim < 0 || feeSantim > grossTotalSantim) throw new Error('Verified processing fee is invalid.');

  let allocatedFee = 0;
  for (const [index, line] of lines.entries()) {
    const gross = line.amounts.grossSaleSantim;
    const lineFee = index === lines.length - 1 && deliverySantim === 0
      ? feeSantim - allocatedFee
      : Math.floor(feeSantim * gross / grossTotalSantim);
    allocatedFee += lineFee;
    const saleData: Prisma.FinancialTransactionCreateInput = {
      order: { connect: { id: order.id } },
      orderItem: { connect: { id: line.item.id } },
      ...(paymentId ? { payment: { connect: { id: paymentId } } } : {}),
      customer: { connect: { id: order.userId } },
      seller: { connect: { id: order.shopId } },
      productId: line.item.productId,
      kind: 'SALE',
      reference: `sale:${line.item.id}`,
      ...line.amounts,
      processingFeeSantim: lineFee,
      settlementStatus: FinancialStatus.PENDING,
    };
    const postings = isCod
      ? [
          { account: `receivable:commission:${order.shopId}`, debitSantim: line.amounts.commissionSantim, creditSantim: 0 },
          { account: 'income:commission', debitSantim: 0, creditSantim: line.amounts.commissionSantim },
        ]
      : [
          { account: 'asset:payment-clearing', debitSantim: gross - lineFee, creditSantim: 0 },
          { account: 'expense:payment-processing', debitSantim: lineFee, creditSantim: 0 },
          { account: `liability:seller-pending:${order.shopId}`, debitSantim: 0, creditSantim: line.amounts.sellerAmountSantim },
          { account: 'liability:commission-pending', debitSantim: 0, creditSantim: line.amounts.commissionSantim },
        ];
    await createTransaction(tx, saleData, postings);
  }

  if (!isCod && deliverySantim > 0) {
    const deliveryFee = feeSantim - allocatedFee;
    await createTransaction(tx, {
      order: { connect: { id: order.id } },
      ...(paymentId ? { payment: { connect: { id: paymentId } } } : {}),
      customer: { connect: { id: order.userId } },
      seller: { connect: { id: order.shopId } },
      kind: 'DELIVERY',
      reference: `delivery:${order.id}`,
      grossSaleSantim: deliverySantim,
      sellerAmountSantim: 0,
      processingFeeSantim: deliveryFee,
      settlementStatus: FinancialStatus.PENDING,
    }, [
      { account: 'asset:payment-clearing', debitSantim: deliverySantim - deliveryFee, creditSantim: 0 },
      { account: 'expense:payment-processing', debitSantim: deliveryFee, creditSantim: 0 },
      { account: 'income:delivery-fee', debitSantim: 0, creditSantim: deliverySantim },
    ]);
  }

  const sellerPending = isCod ? 0 : lines.reduce((sum, line) => sum + line.amounts.sellerAmountSantim, 0);
  const commissionPending = lines.reduce((sum, line) => sum + line.amounts.commissionSantim, 0);
  if (sellerPending > 0) await tx.financialWallet.upsert({
      where: { userId: order.shop.ownerId },
      create: { userId: order.shop.ownerId, pendingSantim: sellerPending },
      update: { pendingSantim: { increment: sellerPending } },
    });
  if (commissionPending > 0) {
    const owner = await tx.user.findFirst({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
    if (owner) {
      await tx.financialWallet.upsert({
        where: { userId: owner.id },
        create: { userId: owner.id, pendingSantim: commissionPending },
        update: { pendingSantim: { increment: commissionPending } },
      });
    }
  }
  await recordEligibleOrderCommission(tx, order.id);
  if (!isCod && order.status === 'DELIVERED') await releaseOrderSettlement(tx, order.id);
}

export async function releaseOrderSettlement(tx: TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentMethod: true } });
  if (order.paymentMethod === 'COD') return;
  const sales = await tx.financialTransaction.findMany({ where: { orderId, kind: 'SALE', settlementStatus: FinancialStatus.PENDING } });
  if (!sales.length) return;
  const sellerId = sales[0].sellerId;
  if (!sellerId || sales.some((sale) => sale.sellerId !== sellerId)) throw new Error('An order settlement cannot span multiple sellers.');
  const sellerAmount = sales.reduce((sum, sale) => sum + sale.sellerAmountSantim, 0);
  const platformCommission = sales.reduce((sum, sale) => sum + sale.commissionSantim, 0);
  const seller = await tx.shop.findUniqueOrThrow({ where: { id: sellerId }, select: { ownerId: true } });
  const owner = await tx.user.findFirst({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
  if (platformCommission > 0 && !owner) throw new Error('An active owner account is required to release platform commission.');

  for (const sale of sales) {
    await tx.financialTransaction.update({ where: { id: sale.id }, data: { settlementStatus: FinancialStatus.AVAILABLE } });
    await createTransaction(tx, {
      order: { connect: { id: orderId } },
      seller: { connect: { id: sellerId } },
      ...(sale.customerId ? { customer: { connect: { id: sale.customerId } } } : {}),
      productId: sale.productId,
      kind: 'SETTLEMENT_RELEASE',
      reference: `release:${sale.id}`,
      sellerAmountSantim: sale.sellerAmountSantim,
      commissionSantim: sale.commissionSantim,
      settlementStatus: FinancialStatus.AVAILABLE,
    }, [
      { account: `liability:seller-pending:${sellerId}`, debitSantim: sale.sellerAmountSantim, creditSantim: 0 },
      { account: `liability:seller-available:${sellerId}`, debitSantim: 0, creditSantim: sale.sellerAmountSantim },
      { account: 'liability:commission-pending', debitSantim: sale.commissionSantim, creditSantim: 0 },
      { account: 'liability:commission-available', debitSantim: 0, creditSantim: sale.commissionSantim },
    ]);
  }

  if (sellerAmount > 0) {
    const updated = await tx.financialWallet.updateMany({
      where: { userId: seller.ownerId, pendingSantim: { gte: sellerAmount } },
      data: { pendingSantim: { decrement: sellerAmount }, availableSantim: { increment: sellerAmount } },
    });
    if (updated.count !== 1) throw new Error('Seller pending settlement does not match the wallet balance.');
  }
  if (owner && platformCommission > 0) {
    const updated = await tx.financialWallet.updateMany({
      where: { userId: owner.id, pendingSantim: { gte: platformCommission } },
      data: { pendingSantim: { decrement: platformCommission }, availableSantim: { increment: platformCommission } },
    });
    if (updated.count !== 1) throw new Error('Pending platform commission does not match the owner wallet balance.');
  }
  if (owner) {
    const sellerWallet = await tx.financialWallet.findUniqueOrThrow({ where: { userId: seller.ownerId } });
    const codSales = await tx.financialTransaction.findMany({
      where: { sellerId, kind: 'SALE', settlementStatus: FinancialStatus.PENDING, order: { paymentMethod: 'COD' } },
      orderBy: { createdAt: 'asc' },
    });
    let remainingAvailable = sellerWallet.availableSantim;
    for (const codSale of codSales) {
      if (remainingAvailable <= 0) break;
      const collected = await tx.financialTransaction.aggregate({
        where: { kind: 'COD_COMMISSION_COLLECTION', reversesId: codSale.id },
        _sum: { commissionSantim: true },
      });
      const outstanding = codSale.commissionSantim - (collected._sum.commissionSantim || 0);
      const amount = Math.min(remainingAvailable, outstanding);
      if (amount <= 0) continue;
      await createTransaction(tx, {
        ...(codSale.orderId ? { order: { connect: { id: codSale.orderId } } } : {}),
        ...(codSale.customerId ? { customer: { connect: { id: codSale.customerId } } } : {}),
        seller: { connect: { id: sellerId } },
        kind: 'COD_COMMISSION_COLLECTION',
        reference: `cod-collection:${codSale.id}:${randomUUID()}`,
        reverses: { connect: { id: codSale.id } },
        commissionSantim: amount,
        settlementStatus: FinancialStatus.AVAILABLE,
      }, [
        { account: `liability:seller-available:${sellerId}`, debitSantim: amount, creditSantim: 0 },
        { account: `receivable:commission:${sellerId}`, debitSantim: 0, creditSantim: amount },
      ]);
      const walletUpdate = await tx.financialWallet.updateMany({
        where: { userId: seller.ownerId, availableSantim: { gte: amount } },
        data: { availableSantim: { decrement: amount } },
      });
      if (walletUpdate.count !== 1) throw new Error('COD commission collection exceeds the seller available balance.');
      const ownerUpdate = await tx.financialWallet.updateMany({
        where: { userId: owner.id, pendingSantim: { gte: amount } },
        data: { pendingSantim: { decrement: amount }, availableSantim: { increment: amount } },
      });
      if (ownerUpdate.count !== 1) throw new Error('COD commission collection does not match the owner pending balance.');
      remainingAvailable -= amount;
      if (amount === outstanding) {
        await tx.financialTransaction.update({ where: { id: codSale.id }, data: { settlementStatus: FinancialStatus.SETTLED } });
      }
    }
  }
}

export async function createPayoutReservation(
  tx: TransactionClient,
  input: { userId: string; destinationId: string; amountSantim: number; isOwner: boolean; idempotencyKey: string },
) {
  if (!Number.isSafeInteger(input.amountSantim) || input.amountSantim <= 0) throw new Error('Enter a valid withdrawal amount.');
  const existing = await tx.payoutRequest.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { destination: true },
  });
  if (existing) {
    if (existing.userId !== input.userId || existing.destinationId !== input.destinationId || existing.amountSantim !== input.amountSantim) {
      throw new Error('This withdrawal confirmation key was already used for a different request.');
    }
    return { payout: existing, destination: existing.destination, alreadyExists: true };
  }
  const pendingRequest = await tx.payoutRequest.findFirst({
    where: { userId: input.userId, status: { in: ['PENDING', 'PROCESSING'] } },
    select: { reference: true },
  });
  if (pendingRequest) throw new Error(`Payout ${pendingRequest.reference} is still being verified. Reconcile it before requesting another withdrawal.`);
  const destination = await tx.payoutDestination.findFirst({
    where: { id: input.destinationId, userId: input.userId, status: 'VERIFIED' },
  });
  if (!destination) throw new Error('Choose a verified withdrawal destination.');
  const updated = await tx.financialWallet.updateMany({
    where: { userId: input.userId, availableSantim: { gte: input.amountSantim } },
    data: { availableSantim: { decrement: input.amountSantim }, pendingSantim: { increment: input.amountSantim } },
  });
  if (updated.count !== 1) throw new Error('Withdrawal exceeds your available balance.');

  const reference = `DH-PAYOUT-${randomUUID()}`;
  const payout = await tx.payoutRequest.create({
    data: { userId: input.userId, destinationId: destination.id, amountSantim: input.amountSantim, reference, idempotencyKey: input.idempotencyKey, status: 'PROCESSING' },
  });
  await tx.activityLog.create({
    data: {
      actorId: input.userId,
      action: 'payout-requested',
      entity: 'payout',
      entityId: payout.id,
      details: `Payout reservation created for ${input.amountSantim} santim; awaiting provider verification.`,
    },
  });
  const transaction = await createTransaction(tx, {
    kind: input.isOwner ? 'OWNER_PAYOUT' : 'SELLER_PAYOUT',
    reference: `payout:${payout.id}`,
    sellerAmountSantim: input.isOwner ? 0 : input.amountSantim,
    commissionSantim: input.isOwner ? input.amountSantim : 0,
    settlementStatus: FinancialStatus.PENDING,
  }, [
    { account: `liability:payout-pending:${input.userId}`, debitSantim: 0, creditSantim: input.amountSantim },
    { account: `liability:wallet-available:${input.userId}`, debitSantim: input.amountSantim, creditSantim: 0 },
  ]);
  await tx.payoutRequest.update({ where: { id: payout.id }, data: { transactionId: transaction.id } });
  return { payout, destination, alreadyExists: false };
}

export async function completePayout(id: string, status: 'SUCCEEDED' | 'FAILED', providerReference?: string, failureReason?: string) {
  return import('./db').then(({ db }) => db.$transaction(async (tx) => {
    const payout = await tx.payoutRequest.findUniqueOrThrow({ where: { id } });
    if (payout.status === 'SUCCEEDED' || payout.status === 'FAILED') return payout;
    const updatedWallet = await tx.financialWallet.updateMany({
      where: { userId: payout.userId, pendingSantim: { gte: payout.amountSantim } },
      data: status === 'SUCCEEDED'
        ? { pendingSantim: { decrement: payout.amountSantim } }
        : { pendingSantim: { decrement: payout.amountSantim }, availableSantim: { increment: payout.amountSantim } },
    });
    if (updatedWallet.count !== 1) throw new Error('Payout reservation does not match the wallet pending balance.');
    if (!payout.transactionId) throw new Error('Payout ledger reservation is missing.');
    await tx.financialTransaction.findUniqueOrThrow({ where: { id: payout.transactionId } });
    if (status === 'FAILED') {
      await createTransaction(tx, {
        kind: 'PAYOUT_RELEASE',
        reference: `payout-release:${payout.id}`,
        sellerAmountSantim: payout.amountSantim,
        settlementStatus: FinancialStatus.AVAILABLE,
      }, [
        { account: `liability:payout-pending:${payout.userId}`, debitSantim: payout.amountSantim, creditSantim: 0 },
        { account: `liability:wallet-available:${payout.userId}`, debitSantim: 0, creditSantim: payout.amountSantim },
      ]);
    } else {
      await createTransaction(tx, {
        kind: 'PAYOUT_SETTLED',
        reference: `payout-settled:${payout.id}`,
        sellerAmountSantim: payout.amountSantim,
        settlementStatus: FinancialStatus.SETTLED,
      }, [
        { account: `liability:payout-pending:${payout.userId}`, debitSantim: payout.amountSantim, creditSantim: 0 },
        { account: 'asset:payment-clearing', debitSantim: 0, creditSantim: payout.amountSantim },
      ]);
    }
    return tx.payoutRequest.update({
      where: { id: payout.id },
      data: { status, providerReference: providerReference ?? null, failureReason: failureReason ?? null, completedAt: new Date() },
    });
  }));
}
