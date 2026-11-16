import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { setSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = z.object({ email: z.email(), password: z.string() }).parse(await req.json());
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.accountStatus !== 'ACTIVE' || !await bcrypt.compare(password, user.passwordHash)) return NextResponse.json({ error: 'Email or password is incorrect, or the account is suspended.' }, { status: 401 });
    await setSession(user.id);
    return NextResponse.json({ ok: true, role: user.role });
  } catch { return NextResponse.json({ error: 'Please enter a valid email and password.' }, { status: 400 }); }
}
