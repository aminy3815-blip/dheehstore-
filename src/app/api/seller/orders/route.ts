import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { recordPaidOrder, releaseOrderSettlement } from '@/lib/finance-ledger';

export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'PRODUCER' || !user.shop) return NextResponse.json({ error: 'Producer access required.' }, { status: 403 });
  try {
    const { orderId, status } = z.object({ orderId: z.string(), status: z.enum(['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED']) }).parse(await req.json());
    await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, shopId: user.shop!.id }, include: { items: true, chapaPayment: true } });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (['CANCELLED', 'RETURNED'].includes(order.status) || order.status === 'DELIVERED') throw new Error('This order is already in a final state.');
      if (status === 'CANCELLED' && order.paymentStatus === 'PAID') throw new Error('A paid order cannot be cancelled here; record and verify the customer refund first.');
      if (status === 'CANCELLED' && order.paymentMethod === 'CHAPA' && order.paymentStatus === 'PENDING' && order.chapaPayment?.status === 'PENDING') throw new Error('A Chapa payment is still pending. Verify or cancel it with the provider before cancelling this order.');
      if (status === 'RETURNED') throw new Error('A return can only be recorded after its refund has been verified by the owner.');
      const paid = order.paymentStatus === 'PAID' || (status === 'DELIVERED' && order.paymentMethod === 'COD');
      await tx.order.update({ where: { id: orderId }, data: { status, ...(paid && order.paymentStatus !== 'PAID' ? { paymentStatus: 'PAID' } : {}) } });
      if (status === 'CANCELLED') {
        for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
      if (paid && order.paymentStatus !== 'PAID') await recordPaidOrder(tx, order.id, null);
      if (status === 'DELIVERED' && paid) await releaseOrderSettlement(tx, order.id);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'ORDER_NOT_FOUND') return NextResponse.json({ error: 'Order not found for your shop.' }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update order.' }, { status: 400 });
  }
}
