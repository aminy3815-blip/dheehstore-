import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import { redirect } from 'next/navigation';
import { ChapaPayButton } from '@/components/PaymentControls';

export const dynamic = 'force-dynamic';

export default async function Orders({ searchParams }: { searchParams: Promise<{ placed?: string; payment?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login');
  const { placed, payment } = await searchParams;
  const orders = await db.order.findMany({
    where: { userId: user.id },
    include: { shop: true, items: true, address: true },
    orderBy: { createdAt: 'desc' },
  });
  return <main className="wrap pageContent">
    <div className="eyebrow">YOUR DHEEHSTORE</div><h1>Orders & updates</h1>
    {placed && <div className="successBox">Order placed. Your order reference{placed.includes(',') ? 's' : ''}: <b>{placed}</b>. Payment is pending confirmation.</div>}
    {payment === 'retry' && <div className="infoBox">Your orders were saved, but Chapa checkout did not start. Retry below. No payment is considered complete until Chapa verifies it.</div>}
    {payment === 'pending' && <div className="infoBox">Payment is awaiting Chapa confirmation. This page will show the verified status when you return.</div>}
    {payment === 'paid' && <div className="successBox">Chapa verified your payment successfully.</div>}
    {payment === 'failed' && <div className="errorBox">Chapa reports that payment did not complete. You can retry from the order below.</div>}
    {payment === 'verification-required' && <div className="errorBox">We could not verify the payment with Chapa yet. Check back later or contact support; the order is not marked paid.</div>}
    {orders.length ? orders.map((order, index) => {
      const paymentOrderIds = order.chapaPaymentId
        ? orders.filter((candidate) => candidate.chapaPaymentId === order.chapaPaymentId).map((candidate) => candidate.id)
        : [order.id];
      const showPayButton = order.paymentMethod === 'CHAPA' &&
        order.paymentStatus === 'PENDING' &&
        (!order.chapaPaymentId || orders.findIndex((candidate) => candidate.chapaPaymentId === order.chapaPaymentId) === index);
      return <article className="orderCard" key={order.id}>
        <div className="orderTop"><div><small>ORDER {order.orderNumber}</small><h2>{order.shop.name}</h2></div><span className="statusPill">{order.status.replaceAll('_', ' ')}</span></div>
        <div className="orderItems">{order.items.map((item) => <div key={item.id}>{item.quantity} × {item.name}<b>{money(item.unitPrice * item.quantity)}</b></div>)}</div>
        <div className="orderBottom"><span>{order.createdAt.toLocaleDateString('en-ET')} · {order.paymentMethod.replaceAll('_', ' ')} / {order.paymentStatus}</span><b>Total {money(order.total)}</b></div>
        <div className="orderAddress">Deliver to: {order.address.city}{order.address.district ? `, ${order.address.district}` : ''} · {order.address.phone}</div>
        {showPayButton && <ChapaPayButton orderIds={paymentOrderIds}/>}
      </article>;
    }) : <div className="empty">Your orders will show up here after checkout. <a href="/#market">Start exploring →</a></div>}
  </main>;
}
