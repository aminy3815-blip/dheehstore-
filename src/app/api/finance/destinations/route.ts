import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwner, getUser } from '@/lib/auth';
import { decryptBankingValue, encryptBankingValue } from '@/lib/banking-crypto';
import { chapaRequest } from '@/lib/chapa';
import { db } from '@/lib/db';

function bankRows(data: unknown): { code: string; name: string; destinationType: 'BANK' | 'WALLET' }[] {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { banks?: unknown }).banks)
    ? (data as { banks: unknown[] }).banks : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const bank = row as Record<string, unknown>;
    const code = bank.id ?? bank.code;
    const name = bank.name ?? bank.bank_name;
    if ((typeof code !== 'string' && typeof code !== 'number') || typeof name !== 'string') return [];
    const normalizedName = name.toLowerCase();
    const destinationType = ['telebirr', 'cbe birr', 'awashbirr', 'coopay', 'e-birr', 'ebirr', 'm-pesa', 'mpesa', 'amole']
      .some((keyword) => normalizedName.includes(keyword)) ? 'WALLET' as const : 'BANK' as const;
    return [{ code: String(code), name, destinationType }];
  });
}

async function bankingUser() {
  const user = await getUser();
  if (!user || (user.role !== 'PRODUCER' && !(await getOwner()))) return null;
  return user;
}

export async function GET() {
  const user = await bankingUser();
  if (!user) return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  const [destinations, payouts, transactions, wallet, codSales] = await Promise.all([
    db.payoutDestination.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    db.payoutRequest.findMany({ where: { userId: user.id }, include: { destination: { select: { provider: true, accountLast4: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.financialTransaction.findMany({ where: user.shop ? { sellerId: user.shop.id } : { kind: { in: ['SALE', 'SETTLEMENT_RELEASE', 'PAYOUT_SETTLED', 'PAYOUT_RELEASE'] } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.financialWallet.findUnique({ where: { userId: user.id } }),
    user.shop ? db.financialTransaction.findMany({
      where: { sellerId: user.shop.id, kind: 'SALE', settlementStatus: 'PENDING', order: { paymentMethod: 'COD' } },
      select: { id: true, commissionSantim: true },
    }) : Promise.resolve([]),
  ]);
  const codCollections = codSales.length ? await db.financialTransaction.aggregate({
    where: { kind: 'COD_COMMISSION_COLLECTION', reversesId: { in: codSales.map((sale) => sale.id) } },
    _sum: { commissionSantim: true },
  }) : null;
  let banks: { code: string; name: string; destinationType: 'BANK' | 'WALLET' }[] = [];
  let bankError: string | null = null;
  if (process.env.CHAPA_SECRET_KEY) {
    try {
      const response = await chapaRequest('banks', { method: 'GET' });
      banks = bankRows(response.data);
    } catch (error) {
      bankError = error instanceof Error ? error.message : 'Unable to load Chapa-supported destinations.';
    }
  } else {
    bankError = 'Chapa sandbox credentials are not configured; destination setup and payouts are unavailable.';
  }
  return NextResponse.json({
    banks,
    bankError,
    wallet: {
      pendingSantim: wallet?.pendingSantim ?? 0,
      availableSantim: wallet?.availableSantim ?? 0,
      commissionOwedSantim: Math.max(0, codSales.reduce((sum, sale) => sum + sale.commissionSantim, 0) - (codCollections?._sum.commissionSantim ?? 0)),
    },
    destinations: destinations.map((destination) => ({
      id: destination.id,
      provider: destination.provider,
      destinationType: destination.destinationType,
      accountHolder: decryptBankingValue(destination.accountHolderEncrypted),
      accountLast4: destination.accountLast4,
      status: destination.status,
      createdAt: destination.createdAt,
    })),
    payouts,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      kind: transaction.kind,
      grossSaleSantim: transaction.grossSaleSantim,
      eligibleProfitSantim: transaction.eligibleProfitSantim,
      commissionSantim: transaction.commissionSantim,
      sellerAmountSantim: transaction.sellerAmountSantim,
      settlementStatus: transaction.settlementStatus,
      createdAt: transaction.createdAt,
    })),
  });
}

const destinationSchema = z.object({
  destinationType: z.enum(['BANK', 'WALLET']),
  provider: z.string().min(1).max(100),
  bankCode: z.string().min(1).max(30),
  accountHolder: z.string().trim().min(2).max(150),
  accountNumber: z.string().trim().min(4).max(40).regex(/^[A-Za-z0-9+ -]+$/),
});

export async function POST(req: Request) {
  const user = await bankingUser();
  if (!user) return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  try {
    const data = destinationSchema.parse(await req.json());
    const response = await chapaRequest('banks', { method: 'GET' });
    const banks = bankRows(response.data);
    const bank = banks.find((candidate) => candidate.code === data.bankCode);
    if (!bank || bank.name !== data.provider || bank.destinationType !== data.destinationType) return NextResponse.json({ error: 'Choose a destination returned by Chapa’s current supported-bank list.' }, { status: 400 });
    const accountNumber = data.accountNumber.replace(/\s+/g, '');
    const destination = await db.payoutDestination.create({
      data: {
        userId: user.id,
        provider: bank.name,
        destinationType: data.destinationType,
        bankCode: bank.code,
        accountHolderEncrypted: encryptBankingValue(data.accountHolder),
        accountNumberEncrypted: encryptBankingValue(accountNumber),
        accountLast4: accountNumber.slice(-4),
        status: 'PENDING',
      },
      select: { id: true, provider: true, destinationType: true, accountLast4: true, status: true },
    });
    await db.activityLog.create({
      data: {
        actorId: user.id,
        action: 'payout-destination-added',
        entity: 'payout-destination',
        entityId: destination.id,
        details: `${destination.provider} destination added; status pending review.`,
      },
    });
    return NextResponse.json({ ok: true, destination });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save payout destination.' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await bankingUser();
  if (!user) return NextResponse.json({ error: 'Seller or owner access required.' }, { status: 403 });
  try {
    const { destinationId } = z.object({ destinationId: z.string().min(1) }).parse(await req.json());
    const activePayout = await db.payoutRequest.findFirst({
      where: { userId: user.id, destinationId, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    if (activePayout) return NextResponse.json({ error: 'This destination is tied to a payout that is still being verified.' }, { status: 409 });
    const updated = await db.payoutDestination.updateMany({
      where: { id: destinationId, userId: user.id, status: { not: 'DISABLED' } },
      data: { status: 'DISABLED' },
    });
    if (!updated.count) return NextResponse.json({ error: 'Destination not found or already disabled.' }, { status: 404 });
    await db.activityLog.create({
      data: { actorId: user.id, action: 'payout-destination-disabled', entity: 'payout-destination', entityId: destinationId, details: 'Payout destination disabled by its owner.' },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to disable destination.' }, { status: 400 });
  }
}
