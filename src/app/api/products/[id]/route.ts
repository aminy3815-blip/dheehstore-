import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { canManageShop } from '@/lib/marketplace';

const patchSchema = z.object({ name: z.string().min(3).max(120).optional(), description: z.string().min(10).max(3000).optional(), price: z.number().int().positive().optional(), unitCostSantim: z.number().int().min(0).optional(), stock: z.number().int().min(0).optional(), available: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !user.shop || !canManageShop(user.role, user.id, user.shop.ownerId)) return NextResponse.json({ error: 'Producer access required.' }, { status: 403 });
  try {
    const { id } = await params;
    const data = patchSchema.parse(await req.json());
    const result = await db.product.updateMany({ where: { id, shopId: user.shop.id }, data });
    if (!result.count) return NextResponse.json({ error: 'Listing not found for your shop.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ error: error?.issues?.[0]?.message || 'Unable to update listing.' }, { status: 400 }); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !user.shop || !canManageShop(user.role, user.id, user.shop.ownerId)) return NextResponse.json({ error: 'Producer access required.' }, { status: 403 });
  const { id } = await params;
  const result = await db.product.updateMany({ where: { id, shopId: user.shop.id }, data: { available: false, stock: 0 } });
  if (!result.count) return NextResponse.json({ error: 'Listing not found for your shop.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
