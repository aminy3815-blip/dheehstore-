import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getOwner } from '@/lib/auth';

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  try {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(12).max(128) }).parse(await req.json());
    if (!await bcrypt.compare(currentPassword, owner.passwordHash)) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    await db.$transaction([
      db.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } }),
      db.activityLog.create({ data: { actorId: owner.id, action: 'password-change', entity: 'owner-account', entityId: owner.id, details: 'Owner password changed.' } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ error: error?.issues?.[0]?.message || 'Unable to change password.' }, { status: 400 }); }
}
