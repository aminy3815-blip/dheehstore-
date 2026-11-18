import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getOwner, getUser } from '@/lib/auth';
import { decryptBankingValue } from '@/lib/banking-crypto';
import { assertChapaPayoutsEnabled, chapaRequest } from '@/lib/chapa';
import { db } from '@/lib/db';
import { createPayoutReservation } from '@/lib/finance-ledger';

const schema = z.object({
  destinationId: z.string().min(1),
  amountEtb: z.number().positive().max(100000000),
  confirmed: z.literal(true),
  idempotencyKey: z.uuid(),
  currentPassword: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getUser();
  const owner = await getOwner();
  const isOwner = Boolean(owner);
  if (!user || (!isOwner && (user.role !== 'PRODUCER' || !user.shop))) {
    return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  }
  try {
    assertChapaPayoutsEnabled();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chapa payouts are unavailable.' }, { status: 503 });
  }

  let payoutReference: string | null = null;
  try {
    const data = schema.parse(await req.json());
    if (isOwner) {
      if (!data.currentPassword || !await bcrypt.compare(data.currentPassword, user.passwordHash)) {
        return NextResponse.json({ error: 'Owner password confirmation failed.' }, { status: 403 });
      }
    }
    const destination = await db.payoutDestination.findFirst({
      where: { id: data.destinationId, userId: user.id, status: 'VERIFIED' },
      select: { bankCode: true },
    });
    if (!destination?.bankCode || !/^\d+$/.test(destination.bankCode)) {
      return NextResponse.json({ error: 'The verified destination has no supported Chapa transfer code.' }, { status: 400 });
    }
    const amountSantim = Math.round(data.amountEtb * 100);
    if (!Number.isSafeInteger(amountSantim) || amountSantim <= 0) return NextResponse.json({ error: 'Enter a valid withdrawal amount in ETB.' }, { status: 400 });
    const reserved = await db.$transaction((tx) => createPayoutReservation(tx, {
      userId: user.id,
      destinationId: data.destinationId,
      amountSantim,
      isOwner,
      idempotencyKey: data.idempotencyKey,
    }));
    payoutReference = reserved.payout.reference;
    if (reserved.alreadyExists) {
      return NextResponse.json({ status: reserved.payout.status, reference: payoutReference, message: 'This withdrawal request was already submitted; it will not be sent twice.' }, { status: 202 });
    }

    const accountNumber = decryptBankingValue(reserved.destination.accountNumberEncrypted);
    const transfer = await chapaRequest('transfers', {
      method: 'POST',
      body: JSON.stringify({
        account_name: decryptBankingValue(reserved.destination.accountHolderEncrypted),
        account_number: accountNumber,
        amount: (amountSantim / 100).toFixed(2),
        currency: 'ETB',
        reference: payoutReference,
        bank_code: Number(reserved.destination.bankCode),
      }),
    });
    const providerReference = typeof transfer.data?.reference === 'string' ? transfer.data.reference : payoutReference;
    await db.payoutRequest.update({ where: { id: reserved.payout.id }, data: { providerReference } });
    return NextResponse.json({
      status: 'PROCESSING',
      reference: payoutReference,
      message: 'Payout submitted. Funds remain reserved until Chapa confirms the final transfer status.',
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Payout request could not be completed.',
      ...(payoutReference ? { reference: payoutReference, reserved: true } : {}),
    }, { status: payoutReference ? 502 : 400 });
  }
}
