import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { groupCheckoutItemsByShop } from '@/lib/marketplace';

const schema = z.object({ items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(50) })).max(100) });
export async function POST(req: Request) {
  try {
    const { items } = schema.parse(await req.json());
    if (new Set(items.map((item) => item.productId)).size !== items.length) return NextResponse.json({ error: 'Duplicate cart items.' }, { status: 400 });
    const products = await db.product.findMany({ where: { id: { in: items.map((item) => item.productId) }, available: true, shop: { status: 'APPROVED' } }, include: { shop: { select: { id: true, name: true, deliveryFee: true } } } });
    for (const item of items) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || product.stock < item.quantity) return NextResponse.json({ error: 'A cart item is unavailable or the requested quantity exceeds current stock.' }, { status: 409 });
    }
    const grouped = groupCheckoutItemsByShop(items, new Map(products.map((p) => [p.id, p.shopId])));
    const sellers = [...grouped].map(([shopId, lines]) => {
      const shop = products.find((p) => p.shopId === shopId)!.shop;
      const subtotal = lines.reduce((sum, line) => sum + products.find((p) => p.id === line.productId)!.price * line.quantity, 0);
      return { shopName: shop.name, subtotal, deliveryFee: shop.deliveryFee, total: subtotal + shop.deliveryFee };
    });
    return NextResponse.json({ sellers, subtotal: sellers.reduce((n, s) => n + s.subtotal, 0), deliveryFee: sellers.reduce((n, s) => n + s.deliveryFee, 0), total: sellers.reduce((n, s) => n + s.total, 0) });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Unable to calculate your cart.' }, { status: 400 }); }
}
