import { NextResponse } from 'next/server';
import { getOwner, getUser } from '@/lib/auth';
import { db } from '@/lib/db';

function cell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  const owner = await getOwner();
  if (!user || (!owner && user.role !== 'PRODUCER')) return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  const { id } = await params;
  const payout = await db.payoutRequest.findFirst({
    where: { id, userId: user.id },
    include: { destination: { select: { provider: true, accountLast4: true, destinationType: true } } },
  });
  if (!payout) return NextResponse.json({ error: 'Payout was not found for this account.' }, { status: 404 });
  if (payout.status !== 'SUCCEEDED' || !payout.completedAt) {
    return NextResponse.json({ error: 'A receipt is available only after Chapa verifies successful settlement.' }, { status: 409 });
  }
  const rows = [
    ['field', 'value'],
    ['Payout reference', payout.reference],
    ['Provider reference', payout.providerReference || ''],
    ['Status', payout.status],
    ['Amount ETB', (payout.amountSantim / 100).toFixed(2)],
    ['Destination', payout.destination.provider],
    ['Destination type', payout.destination.destinationType],
    ['Account ending', `****${payout.destination.accountLast4}`],
    ['Completed at', payout.completedAt.toISOString()],
  ];
  const body = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payout-receipt-${payout.reference}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
