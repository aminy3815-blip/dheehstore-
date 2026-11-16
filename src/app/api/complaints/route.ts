import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

export async function POST(req: Request) {
  const reporter = await getUser();
  if (!reporter) return NextResponse.json({ error: 'Sign in to send a complaint.' }, { status: 401 });
  try {
    const data = z.object({ subject: z.string().trim().min(4).max(160), message: z.string().trim().min(10).max(4000), targetType: z.enum(['ORDER', 'SELLER', 'PRODUCT', 'OTHER']).optional(), targetId: z.string().max(100).optional(), orderNumber: z.string().max(80).optional() }).parse(await req.json());
    const complaint = await db.$transaction(async (tx) => {
      const created = await tx.complaint.create({ data: { ...data, reporterId: reporter.id } });
      const owner = await tx.user.findFirst({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
      if (owner) await tx.notification.create({ data: { userId: owner.id, title: 'New customer complaint', body: data.subject, href: `/owner?view=complaints` } });
      return created;
    });
    return NextResponse.json({ ok: true, id: complaint.id });
  } catch (error: any) { return NextResponse.json({ error: error?.issues?.[0]?.message || 'Unable to submit complaint.' }, { status: 400 }); }
}
