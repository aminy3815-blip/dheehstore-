import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { assertChapaTestMode, chapaRequest } from '@/lib/chapa';
import { db } from '@/lib/db';

const schema = z.object({ orderIds: z.array(z.string().min(1)).min(1).max(25) });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in before starting checkout.' }, { status: 401 });
  let paymentId = '';
  let txRef = '';
  let amountSantim = 0;
  const requestOrigin = new URL(req.url).origin;
  const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : requestOrigin);
  if (!baseUrl) return NextResponse.json({ error: 'APP_BASE_URL must be configured for payment callbacks.' }, { status: 503 });
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'APP_BASE_URL must use HTTPS in production.' }, { status: 503 });
  }
  try {
    assertChapaTestMode();
    const { orderIds } = schema.parse(await req.json());
    if (new Set(orderIds).size !== orderIds.length) return NextResponse.json({ error: 'Duplicate orders were submitted.' }, { status: 400 });
    const orders = await db.order.findMany({ where: { id: { in: orderIds }, userId: user.id }, include: { user: true } });
    if (orders.length !== orderIds.length || orders.some((order) =>
      order.paymentMethod !== 'CHAPA' ||
      order.paymentStatus !== 'PENDING' ||
      order.status === 'CANCELLED' ||
      order.status === 'RETURNED'
    )) {
      return NextResponse.json({ error: 'One or more orders cannot be paid with Chapa.' }, { status: 400 });
    }
    if (orders.some((order) => order.chapaPaymentId)) {
      const current = orders[0].chapaPaymentId ? await db.chapaPayment.findUnique({ where: { id: orders[0].chapaPaymentId } }) : null;
      if (current?.status === 'PENDING' && current.checkoutUrl && orders.every((order) => order.chapaPaymentId === current.id)) {
        return NextResponse.json({ checkoutUrl: current.checkoutUrl });
      }
    }
    amountSantim = orders.reduce((sum, order) => sum + order.total * 100, 0);
    if (!Number.isSafeInteger(amountSantim) || amountSantim <= 0) throw new Error('Order amount is invalid.');
    txRef = `DHEEH-${randomUUID()}`;
    const payment = await db.$transaction(async (tx) => {
      const created = await tx.chapaPayment.create({ data: { txRef, amountSantim } });
      paymentId = created.id;
      for (const order of orders) {
        const attached = await tx.order.updateMany({
          where: {
            id: order.id,
            userId: user.id,
            paymentStatus: 'PENDING',
            status: { notIn: ['CANCELLED', 'RETURNED'] },
            chapaPaymentId: order.chapaPaymentId,
          },
          data: { chapaPaymentId: created.id },
        });
        if (attached.count !== 1) throw new Error('An order changed while payment was being initialized. Refresh and retry.');
      }
      return created;
    });

    const [firstName, ...lastParts] = orders[0].user.name.trim().split(/\s+/);
    const result = await chapaRequest('transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: (amountSantim / 100).toFixed(2),
        currency: 'ETB',
        email: orders[0].user.email,
        first_name: firstName || 'Customer',
        last_name: lastParts.join(' ') || firstName || 'Customer',
        ...(orders[0].user.phone ? { phone_number: orders[0].user.phone } : {}),
        tx_ref: txRef,
        callback_url: `${baseUrl}/api/payments/chapa/verify?tx_ref=${encodeURIComponent(txRef)}`,
        return_url: `${baseUrl}/orders?payment=pending`,
        customization: { title: 'DHEEHSTORE order', description: 'Marketplace order payment' },
      }),
    });
    const checkoutUrl = result.data?.checkout_url;
    if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) throw new Error('Chapa did not return a valid checkout link.');
    await db.chapaPayment.update({ where: { id: payment.id }, data: { checkoutUrl } });
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Chapa checkout.';
    if (paymentId) {
      try {
        await db.chapaPayment.update({ where: { id: paymentId }, data: { status: 'FAILED' } });
      } catch {
        return NextResponse.json({ error: `Chapa initialization failed and payment status could not be saved; reference ${txRef} requires reconciliation.` }, { status: 500 });
      }
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
