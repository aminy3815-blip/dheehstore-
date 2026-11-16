import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

const schema = z.object({ productId: z.string(), rating: z.number().int().min(1).max(5), body: z.string().trim().min(5).max(1000) });
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to leave a review.' }, { status: 401 });
  try {
    const data = schema.parse(await req.json());
    const purchase = await db.orderItem.findFirst({ where: { productId: data.productId, order: { userId: user.id, status: 'DELIVERED' } }, include: { product: { select: { shopId: true } } } });
    if (!purchase) return NextResponse.json({ error: 'Reviews are available after a delivered purchase.' }, { status: 403 });
    const review = await db.review.upsert({ where: { userId_productId: { userId: user.id, productId: data.productId } }, update: { rating: data.rating, body: data.body, verifiedPurchase: true }, create: { ...data, userId: user.id, shopId: purchase.product.shopId, verifiedPurchase: true } });
    return NextResponse.json({ ok: true, id: review.id });
  } catch (error: any) { return NextResponse.json({ error: error?.issues?.[0]?.message || 'Unable to save review.' }, { status: 400 }); }
}
