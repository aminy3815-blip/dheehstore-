import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';

const csv = (value: string | number) => {
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export async function GET() {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: 'Owner access required.' }, { status: 403 });
  const statements = await db.weeklyCommissionStatement.findMany({
    include: {
      shop: { select: { id: true, name: true } },
      paymentAllocations: { select: { amountSantim: true } },
      creditAllocations: { select: { amountSantim: true } },
    },
    orderBy: [{ periodStart: 'asc' }, { shop: { name: 'asc' } }],
  });
  const rows = [
    ['Shop', 'Seller ID', 'Period start', 'Period end (exclusive)', 'Eligible sales (santim)', 'Commission (santim)', 'Carry-forward (santim)', 'Payments confirmed (santim)', 'Refund credits (santim)', 'Outstanding (santim)', 'Deadline', 'Status'],
    ...statements.map((statement) => {
      const paid = statement.paymentAllocations.reduce((sum, allocation) => sum + allocation.amountSantim, 0);
      const credited = statement.creditAllocations.reduce((sum, allocation) => sum + allocation.amountSantim, 0);
      const outstanding = Math.max(0, statement.commissionSantim - paid - credited);
      return [
        statement.shop.name,
        statement.shop.id,
        statement.periodStart.toISOString(),
        statement.periodEnd.toISOString(),
        statement.salesSantim,
        statement.commissionSantim,
        statement.carriedSantim,
        paid,
        credited,
        outstanding,
        statement.deadline.toISOString(),
        statement.status,
      ];
    }),
  ];
  return new Response(`\uFEFF${rows.map((row) => row.map(csv).join(',')).join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dheehstore-weekly-commissions.csv"',
      'cache-control': 'private, no-store',
    },
  });
}
