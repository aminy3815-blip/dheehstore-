import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

const csv = (value: string | number) => {
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'PRODUCER' || !user.shop) {
    return NextResponse.json({ error: 'Seller access required.' }, { status: 403 });
  }
  const { id } = await params;
  const statement = await db.weeklyCommissionStatement.findFirst({
    where: { id, shopId: user.shop.id },
    include: {
      paymentAllocations: { select: { amountSantim: true } },
      creditAllocations: { select: { amountSantim: true } },
    },
  });
  if (!statement) return NextResponse.json({ error: 'Commission statement not found.' }, { status: 404 });
  const paidSantim = statement.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountSantim, 0);
  const creditsSantim = statement.creditAllocations.reduce((sum, allocation) => sum + allocation.amountSantim, 0);
  const outstandingSantim = Math.max(0, statement.commissionSantim - paidSantim - creditsSantim);
  const rows = [
    ['Shop', user.shop.name],
    ['Currency', 'ETB'],
    ['Period start', statement.periodStart.toISOString()],
    ['Period end (exclusive)', statement.periodEnd.toISOString()],
    ['Payment deadline', statement.deadline.toISOString()],
    ['Weekly eligible sales (santim)', statement.salesSantim],
    ['Weekly commission (santim)', statement.commissionSantim],
    ['Carried forward at generation (santim)', statement.carriedSantim],
    ['Total due (santim)', statement.totalDueSantim],
    ['Payments confirmed (santim)', paidSantim],
    ['Refund credits applied (santim)', creditsSantim],
    ['Outstanding (santim)', outstandingSantim],
    ['Status', statement.status],
  ];
  const body = rows.map(([key, value]) => `${csv(key)},${csv(value)}`).join('\r\n');
  return new Response(`\uFEFF${body}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="weekly-commission-${statement.periodStart.toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
