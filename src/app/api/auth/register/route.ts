import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { setSession } from '@/lib/auth';

const schema = z.object({ name: z.string().min(2).max(100), email: z.email(), phone: z.string().max(30).optional(), password: z.string().min(8), role: z.enum(['CUSTOMER', 'PRODUCER']), shopName: z.string().min(2).max(100).optional(), description: z.string().max(1000).optional(), city: z.enum(['Addis Ababa', 'Harar', 'Dire Dawa', 'Jijiga']).optional() });

export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());
    if (data.role === 'PRODUCER' && (!data.shopName || !data.city)) return NextResponse.json({ error: 'Shop name and city are required for producer accounts.' }, { status: 400 });
    if (await db.user.findUnique({ where: { email: data.email.toLowerCase() } })) return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    const user = await db.user.create({ data: {
      name: data.name, email: data.email.toLowerCase(), phone: data.phone, passwordHash: await bcrypt.hash(data.password, 12), role: data.role,
      ...(data.role === 'PRODUCER' ? { shop: { create: { name: data.shopName!, slug: `${data.shopName!.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`, description: data.description || 'New DHEEHSTORE shop', city: data.city! } } } : {}),
    } });
    if (data.role === 'PRODUCER') {
      const owner = await db.user.findFirst({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
      if (owner) await db.notification.create({ data: { userId: owner.id, title: 'New producer application', body: `${data.name} applied to sell on DHEEHSTORE.`, href: '/owner?view=sellers' } });
    }
    await setSession(user.id);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (error: any) { return NextResponse.json({ error: error?.issues?.[0]?.message || 'Unable to create account.' }, { status: 400 }); }
}
