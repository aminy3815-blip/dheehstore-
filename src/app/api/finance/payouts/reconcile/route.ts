import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwner, getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyAndSettleChapaPayout } from '@/lib/chapa-payouts';

export async function POST(req: Request) {
  const user = await getUser();
  const owner = await getOwner();
  if (!user || (!owner && user.role !== 'PRODUCER')) return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  try {
    const { payoutId } = z.object({ payoutId: z.string().min(1) }).parse(await req.json());
    const payout = await db.payoutRequest.findFirst({ where: { id: payoutId, userId: user.id } });
    if (!payout) return NextResponse.json({ error: 'Payout was not found for this account.' }, { status: 404 });
    const status = await verifyAndSettleChapaPayout(payout.reference);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payout status.' }, { status: 502 });
  }
}
