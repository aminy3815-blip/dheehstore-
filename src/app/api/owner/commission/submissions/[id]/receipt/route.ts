import { NextResponse } from 'next/server';
import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  const { id } = await params;
  const submission = await db.commissionPaymentSubmission.findUnique({
    where: { id },
    select: { receipt: true, receiptMimeType: true, receiptFileName: true },
  });
  if (!submission?.receipt || !submission.receiptMimeType) {
    return NextResponse.json({ error: 'Payment receipt not found.' }, { status: 404 });
  }
  const fileName = (submission.receiptFileName || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_');
  return new Response(new Uint8Array(submission.receipt), {
    headers: {
      'content-type': submission.receiptMimeType,
      'content-disposition': `inline; filename="${fileName}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
