import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getCommissionOutstanding } from '@/lib/weekly-commission';

export const runtime = 'nodejs';

const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function parseEtb(value: string) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a valid ETB amount with up to two decimal places.');
  const amount = BigInt(match[1]) * BigInt(100) + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (amount <= BigInt(0) || amount > BigInt(2147483647)) throw new Error('Enter a positive amount within the supported range.');
  return Number(amount);
}

function validateReceipt(bytes: Buffer, mimeType: string) {
  const valid = mimeType === 'application/pdf'
    ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : mimeType === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mimeType === 'image/webp'
          ? bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
          : false;
  if (!valid) throw new Error('Receipt file contents do not match the selected file type.');
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== 'PRODUCER' || !user.shop) {
    return NextResponse.json({ error: 'Seller access required.' }, { status: 403 });
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_RECEIPT_BYTES + 65536) {
    return NextResponse.json({ error: 'Payment receipt request exceeds the 3 MB file limit.' }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const data = z.object({
      amount: z.string().max(20),
      destinationId: z.string(),
      reference: z.string().trim().min(4).max(100),
      idempotencyKey: z.string().uuid(),
    }).parse({
      amount: form.get('amount'),
      destinationId: form.get('destinationId'),
      reference: form.get('reference'),
      idempotencyKey: form.get('idempotencyKey'),
    });
    const amountSantim = parseEtb(data.amount);
    const file = form.get('receipt');
    if (!(file instanceof File)) throw new Error('Upload a payment receipt.');
    if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES || !allowedTypes.has(file.type)) {
      throw new Error('Receipt must be a PDF, JPEG, PNG, or WebP file no larger than 3 MB.');
    }
    const receipt = Buffer.from(await file.arrayBuffer());
    validateReceipt(receipt, file.type);

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.commissionPaymentSubmission.findUnique({
        where: { shopId_idempotencyKey: { shopId: user.shop!.id, idempotencyKey: data.idempotencyKey } },
      });
      if (existing) {
        if (existing.amountSantim !== amountSantim || existing.reference !== data.reference || existing.destinationId !== data.destinationId) {
          throw new Error('This confirmation key was already used for a different payment submission.');
        }
        return { id: existing.id, alreadySubmitted: true };
      }
      const pending = await tx.commissionPaymentSubmission.findFirst({
        where: { shopId: user.shop!.id, status: { in: ['PENDING', 'AWAITING_VERIFICATION'] } },
      });
      if (pending) throw new Error('Your previous payment submission is awaiting owner verification.');
      const destination = await tx.ownerCommissionDestination.findUnique({ where: { id: data.destinationId } });
      if (!destination) throw new Error('Choose a currently configured DHEEHSTORE payment destination.');
      const method = destination.provider === 'TELEBIRR' ? 'TELEBIRR' : destination.provider === 'EBIRR' ? 'EBIRR' : 'BANK_TRANSFER';
      const outstanding = await getCommissionOutstanding(tx, user.shop!.id);
      if (amountSantim > outstanding) throw new Error('Submitted amount exceeds your current outstanding commission.');
      const submission = await tx.commissionPaymentSubmission.create({
        data: {
          shopId: user.shop!.id,
          submitterId: user.id,
          destinationId: destination.id,
          destinationProvider: destination.provider,
          destinationLast4: destination.accountLast4,
          method,
          amountSantim,
          reference: data.reference,
          idempotencyKey: data.idempotencyKey,
          receipt,
          receiptMimeType: file.type,
          receiptFileName: file.name.slice(0, 180),
          status: 'AWAITING_VERIFICATION',
        },
      });
      await tx.weeklyCommissionStatement.updateMany({
        where: { shopId: user.shop!.id, status: { in: ['PENDING', 'OVERDUE', 'REJECTED'] } },
        data: { status: 'AWAITING_VERIFICATION' },
      });
      const owners = await tx.user.findMany({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
      if (owners.length) await tx.notification.createMany({
        data: owners.map(({ id }) => ({
          userId: id,
          title: 'Seller commission payment submitted',
          body: `${user.shop!.name} submitted a payment for owner verification.`,
          href: '/owner?view=commission-collection',
        })),
      });
      return { id: submission.id, alreadySubmitted: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, ...result }, { status: result.alreadySubmitted ? 200 : 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'A concurrent payment update occurred. Reload and retry.' }, { status: 409 });
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'This payment reference or submission has already been used.' }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to submit commission payment.' }, { status: 400 });
  }
}
