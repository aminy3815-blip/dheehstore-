import { NextResponse } from 'next/server';
import { verifyAndSettleChapaPayment } from '@/lib/chapa-payments';

export async function GET(req: Request) {
  const txRef = new URL(req.url).searchParams.get('tx_ref');
  if (!txRef) return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 });
  try {
    const result = await verifyAndSettleChapaPayment(txRef);
    const baseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : new URL(req.url).origin);
    if (!baseUrl || (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://'))) {
      return NextResponse.json({ error: 'APP_BASE_URL must use HTTPS and be configured for payment callbacks.' }, { status: 503 });
    }
    return NextResponse.redirect(new URL(`/orders?payment=${result.status.toLowerCase()}`, baseUrl));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chapa payment verification failed; order remains unpaid.' }, { status: 502 });
  }
}
