import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureCommissionStatements } from '@/lib/weekly-commission';

export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function localDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

async function notifyOnce(input: {
  statementId: string;
  shopOwnerId: string;
  kind: 'STATEMENT_GENERATED' | 'DEADLINE_UPCOMING' | 'DUE_TODAY' | 'OVERDUE';
  title: string;
  body: string;
}) {
  await db.$transaction(async (tx) => {
    const inserted = await tx.commissionReminder.createMany({
      data: [{ statementId: input.statementId, kind: input.kind }],
      skipDuplicates: true,
    });
    if (!inserted.count) return;
    await tx.notification.create({
      data: {
        userId: input.shopOwnerId,
        title: input.title,
        body: input.body,
        href: '/seller',
      },
    });
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Cron authorization required.' }, { status: 401 });
  const mode = new URL(request.url).searchParams.get('mode');
  if (mode !== 'weekly' && mode !== 'reminders') {
    return NextResponse.json({ error: 'Use mode=weekly or mode=reminders.' }, { status: 400 });
  }
  try {
    const now = new Date();
    const statementTime = mode === 'weekly' ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) : now;
    const shops = await db.shop.findMany({ select: { id: true, ownerId: true } });
    for (const shop of shops) {
      await db.$transaction((tx) => ensureCommissionStatements(tx, shop.id, statementTime));
    }
    const statements = await db.weeklyCommissionStatement.findMany({
      where: { periodEnd: { lte: now } },
      include: { shop: { select: { ownerId: true } } },
    });
    let notificationsCreated = 0;
    for (const statement of statements) {
      if (mode === 'weekly') {
        const before = await db.commissionReminder.count({
          where: { statementId: statement.id, kind: 'STATEMENT_GENERATED' },
        });
        await notifyOnce({
          statementId: statement.id,
          shopOwnerId: statement.shop.ownerId,
          kind: 'STATEMENT_GENERATED',
          title: 'Weekly commission statement generated',
          body: `Your statement for ${localDate(statement.periodStart)} is ready. Payment is due by ${localDate(statement.deadline)}.`,
        });
        notificationsCreated += before === 0 ? 1 : 0;
        continue;
      }

      const [paid, credited] = await Promise.all([
        db.commissionPaymentAllocation.aggregate({ where: { statementId: statement.id }, _sum: { amountSantim: true } }),
        db.commissionCreditAllocation.aggregate({ where: { statementId: statement.id }, _sum: { amountSantim: true } }),
      ]);
      const outstanding = Math.max(0, statement.commissionSantim - (paid._sum.amountSantim || 0) - (credited._sum.amountSantim || 0));
      if (!outstanding) continue;
      const today = localDate(now);
      if (today === localDate(statement.deadline)) {
        const before = await db.commissionReminder.count({ where: { statementId: statement.id, kind: 'DUE_TODAY' } });
        await notifyOnce({
          statementId: statement.id, shopOwnerId: statement.shop.ownerId, kind: 'DUE_TODAY',
          title: 'Weekly commission payment is due today',
          body: `An unpaid commission balance remains due by the end of today (${today}, Africa/Addis_Ababa).`,
        });
        notificationsCreated += before === 0 ? 1 : 0;
      } else if (today === localDate(new Date(statement.deadline.getTime() - 24 * 60 * 60 * 1000))) {
        const before = await db.commissionReminder.count({ where: { statementId: statement.id, kind: 'DEADLINE_UPCOMING' } });
        await notifyOnce({
          statementId: statement.id, shopOwnerId: statement.shop.ownerId, kind: 'DEADLINE_UPCOMING',
          title: 'Weekly commission payment is due tomorrow',
          body: `An unpaid commission balance remains. Your payment deadline is ${localDate(statement.deadline)}.`,
        });
        notificationsCreated += before === 0 ? 1 : 0;
      } else if (now > statement.deadline) {
        const before = await db.commissionReminder.count({ where: { statementId: statement.id, kind: 'OVERDUE' } });
        await notifyOnce({
          statementId: statement.id, shopOwnerId: statement.shop.ownerId, kind: 'OVERDUE',
          title: 'Weekly commission payment is overdue',
          body: 'An unpaid weekly commission balance is overdue. Please review your seller dashboard.',
        });
        notificationsCreated += before === 0 ? 1 : 0;
      }
    }
    return NextResponse.json({ ok: true, mode, statements: statements.length, notificationsCreated });
  } catch (error) {
    console.error('Weekly commission cron failed:', error);
    return NextResponse.json({ error: 'Weekly commission task failed.' }, { status: 500 });
  }
}
