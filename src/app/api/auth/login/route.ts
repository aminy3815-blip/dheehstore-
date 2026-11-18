import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertSessionConfiguration, setSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = z.object({
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: z.string(),
    }).parse(await req.json());
    assertSessionConfiguration();
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.accountStatus !== 'ACTIVE' || !await bcrypt.compare(password, user.passwordHash)) return NextResponse.json({ error: 'Email or password is incorrect, or the account is suspended.' }, { status: 401 });
    await setSession(user.id);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please enter a valid email and password.' }, { status: 400 });
    }

    console.error('Authentication login failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      prismaCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return NextResponse.json({ error: 'Unable to sign in right now. Please try again.' }, { status: 500 });
  }
}
