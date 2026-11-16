import { NextResponse } from 'next/server';
import { verifyChapaWebhookSignature } from '@/lib/chapa';
import { verifyAndSettleChapaPayment } from '@/lib/chapa-payments';
import { verifyAndSettleChapaPayout } from '@/lib/chapa-payouts';

export async function POST(req: Request) {
  const rawBody = await req.text();
  let validSignature = false;
  try {
    validSignature = verifyChapaWebhookSignature(rawBody, req.headers.get('x-chapa-signature'));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook verification is not configured.' }, { status: 503 });
  }
  if (!validSignature) return NextResponse.json({ error: 'Invalid Chapa signature.' }, { status: 401 });

  let event: { tx_ref?: unknown; reference?: unknown; type?: unknown; event?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  if (event.type === 'Payout') {
    if (typeof event.reference !== 'string' || !event.reference) return NextResponse.json({ error: 'Payout reference is missing.' }, { status: 400 });
    try {
      await verifyAndSettleChapaPayout(event.reference);
      return NextResponse.json({ received: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payout event.' }, { status: 502 });
    }
  }
  if (typeof event.tx_ref !== 'string' || !event.tx_ref) return NextResponse.json({ error: 'Payment reference is missing.' }, { status: 400 });
  try {
    await verifyAndSettleChapaPayment(event.tx_ref);
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment event.' }, { status: 502 });
  }
}
