import { db } from './db';
import { chapaAmountSantim, chapaRequest } from './chapa';
import { recordPaidOrder } from './finance-ledger';

export async function verifyAndSettleChapaPayment(txRef: string) {
  const payment = await db.chapaPayment.findUnique({ where: { txRef }, include: { orders: true } });
  if (!payment) throw new Error('Chapa payment reference was not found.');
  if (payment.status === 'PAID') return { status: 'PAID' as const, orderIds: payment.orders.map((order) => order.id) };

  const response = await chapaRequest(`transaction/verify/${encodeURIComponent(txRef)}`, { method: 'GET' });
  const details = response.data ?? {};
  const status = String(details.status ?? '').toUpperCase();
  if (String(details.tx_ref ?? '') !== txRef || String(details.currency ?? '').toUpperCase() !== 'ETB') {
    throw new Error('Chapa verification details do not match the expected transaction.');
  }
  const verifiedAmount = chapaAmountSantim(details.amount);
  if (verifiedAmount !== payment.amountSantim) throw new Error('Chapa verified an unexpected payment amount.');

  if (status !== 'SUCCESS') {
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      await db.$transaction(async (tx) => {
        const current = await tx.chapaPayment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === 'PAID') return;
        await tx.chapaPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
        await tx.order.updateMany({ where: { chapaPaymentId: payment.id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
      });
      return { status: 'FAILED' as const, orderIds: payment.orders.map((order) => order.id) };
    }
    return { status: 'PENDING' as const, orderIds: payment.orders.map((order) => order.id) };
  }

  const feeSantim = details.charge === undefined ? 0 : chapaAmountSantim(details.charge);
  const chapaReference = typeof details.reference === 'string' ? details.reference : null;
  await db.$transaction(async (tx) => {
    const current = await tx.chapaPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { orders: true } });
    if (current.status === 'PAID') return;
    await tx.chapaPayment.update({
      where: { id: payment.id },
      data: { status: 'PAID', feeSantim, chapaReference, verifiedAt: new Date() },
    });
    await tx.order.updateMany({
      where: { chapaPaymentId: payment.id, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'PAID', transactionRef: chapaReference ?? txRef },
    });
    const gross = current.orders.reduce((sum, order) => sum + order.total * 100, 0);
    let allocated = 0;
    for (const [index, order] of current.orders.entries()) {
      const share = index === current.orders.length - 1 ? feeSantim - allocated : Math.floor(feeSantim * order.total * 100 / gross);
      allocated += share;
      await recordPaidOrder(tx, order.id, payment.id, share);
    }
  });
  return { status: 'PAID' as const, orderIds: payment.orders.map((order) => order.id) };
}
