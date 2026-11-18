import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';
import { encryptBankingValue } from '@/lib/banking-crypto';

const schema = z.object({
  id: z.string().optional(),
  provider: z.enum(['TELEBIRR', 'EBIRR', 'BANK_TRANSFER']),
  accountHolder: z.string().trim().min(2).max(100),
  accountNumber: z.string().trim().min(4).max(40),
  isDefault: z.boolean(),
});

export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  try {
    const data = schema.parse(await request.json());
    const accountNumber = data.accountNumber.replace(/\s+/g, '');
    if (!/^[\p{L}\p{N}+-]{4,40}$/u.test(accountNumber)) throw new Error('Account number contains unsupported characters.');
    const result = await db.$transaction(async (tx) => {
      if (data.isDefault) await tx.ownerCommissionDestination.updateMany({ data: { isDefault: false } });
      if (data.id) {
        const existing = await tx.ownerCommissionDestination.findUniqueOrThrow({ where: { id: data.id } });
        const destination = await tx.ownerCommissionDestination.update({
          where: { id: existing.id },
          data: {
            provider: data.provider,
            accountHolderEncrypted: encryptBankingValue(data.accountHolder),
            accountNumberEncrypted: encryptBankingValue(accountNumber),
            accountLast4: accountNumber.slice(-4),
            isDefault: data.isDefault,
          },
        });
        await tx.activityLog.create({
          data: { actorId: owner.id, action: 'owner-commission-destination-updated', entity: 'commission-destination', entityId: destination.id },
        });
        return destination;
      }
      const destination = await tx.ownerCommissionDestination.create({
        data: {
          provider: data.provider,
          accountHolderEncrypted: encryptBankingValue(data.accountHolder),
          accountNumberEncrypted: encryptBankingValue(accountNumber),
          accountLast4: accountNumber.slice(-4),
          isDefault: data.isDefault,
        },
      });
      await tx.activityLog.create({
        data: { actorId: owner.id, action: 'owner-commission-destination-created', entity: 'commission-destination', entityId: destination.id },
      });
      return destination;
    });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save payment destination.' }, { status: 400 });
  }
}
