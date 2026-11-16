import { NextResponse } from 'next/server';
import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';
import { getFinanceRange } from '@/lib/finance-report';

function csv(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  try {
    const url = new URL(req.url);
    const range = getFinanceRange(url.searchParams.get('range') || undefined, url.searchParams.get('from') || undefined, url.searchParams.get('to') || undefined);
    const records = await db.financialTransaction.findMany({
      where: {
        kind: { in: ['SALE', 'DELIVERY'] },
        ...(range.from || range.to ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } } : {}),
      },
      include: {
        order: { include: { user: { select: { id: true, email: true } } } },
        orderItem: { select: { name: true, quantity: true, unitPrice: true } },
        seller: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const rows = [
      ['transaction_id', 'date', 'order_id', 'customer_id', 'seller_id', 'shop', 'product', 'gross_sale_etb', 'product_cost_etb', 'eligible_profit_etb', 'commission_etb', 'seller_amount_etb', 'processing_fee_etb', 'refund_etb', 'settlement_status', 'payment_method', 'reference'],
      ...records.map((record) => [
        record.id,
        record.createdAt.toISOString(),
        record.orderId,
        record.order?.user.id,
        record.sellerId,
        record.seller?.name,
        record.orderItem?.name || (record.kind === 'DELIVERY' ? 'Delivery fee' : ''),
        record.grossSaleSantim / 100,
        record.productCostSantim / 100,
        record.eligibleProfitSantim / 100,
        record.commissionSantim / 100,
        record.sellerAmountSantim / 100,
        record.processingFeeSantim / 100,
        record.refundSantim / 100,
        record.settlementStatus,
        record.order?.paymentMethod,
        record.reference,
      ]),
    ];
    const body = rows.map((row) => row.map(csv).join(',')).join('\r\n');
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dheehstore-finance-${range.key}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to export financial report.' }, { status: 400 });
  }
}
