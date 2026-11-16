import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { groupCheckoutItemsByShop } from '@/lib/marketplace';

const schema = z.object({
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(50) })).min(1),
  address: z.object({ city: z.string(), district: z.string().optional(), neighborhood: z.string().optional(), street: z.string().optional(), building: z.string().optional(), instructions: z.string().optional(), phone: z.string().min(5) }),
  paymentMethod: z.enum(['TELEBIRR', 'CHAPA', 'BANK_TRANSFER', 'COD', 'STRIPE']),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to place an order.' }, { status: 401 });
  try {
    const data = schema.parse(await req.json());
    if (data.paymentMethod === 'CHAPA' && !process.env.CHAPA_SECRET_KEY) {
      return NextResponse.json({ error: 'Chapa test mode is not configured. Add a Chapa test secret key before selecting Chapa.' }, { status: 503 });
    }
    const orders = await db.$transaction(async (tx) => {
      const ids = data.items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length) throw new Error('Remove duplicate cart lines and try again.');
      const products = await tx.product.findMany({ where: { id: { in: ids } }, include: { shop: true } });
      const ownerAccount = await tx.user.findFirst({ where: { role: 'OWNER', accountStatus: 'ACTIVE' }, select: { id: true } });
      const grouped = groupCheckoutItemsByShop(data.items, new Map(products.map((product) => [product.id, product.shopId])));
      for (const item of data.items) {
        const product = products.find((entry) => entry.id === item.productId);
        if (!product || !product.available || product.stock < item.quantity || product.shop.status !== 'APPROVED') throw new Error('One or more items are no longer available in that quantity.');
        if (product.unitCostSantim === null) throw new Error(`The seller must add a private production cost for ${product.name} before it can be ordered.`);
      }
      for (const [shopId, items] of grouped) {
        const shop = products.find((product) => product.shopId === shopId)!.shop;
        if (data.paymentMethod === 'COD' && !shop.codEnabled) throw new Error(`${shop.name} does not accept cash on delivery.`);
        for (const item of items) {
          const updated = await tx.product.updateMany({ where: { id: item.productId, available: true, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
          if (updated.count !== 1) throw new Error('Stock changed during checkout. Please refresh your cart.');
        }
      }
      const address = await tx.address.create({ data: { ...data.address, userId: user.id } });
      const created: { id: string; orderNumber: string }[] = [];
      for (const [shopId, items] of grouped) {
        const shop = products.find((product) => product.shopId === shopId)!.shop;
        const subtotal = items.reduce((sum, item) => sum + products.find((product) => product.id === item.productId)!.price * item.quantity, 0);
        const order = await tx.order.create({ data: {
          orderNumber: `DH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          userId: user.id, shopId, addressId: address.id, subtotal, deliveryFee: shop.deliveryFee, total: subtotal + shop.deliveryFee,
          paymentMethod: data.paymentMethod, paymentStatus: 'PENDING',
          items: { create: items.map((item) => { const product = products.find((entry) => entry.id === item.productId)!; return { productId: product.id, name: product.name, unitPrice: product.price, quantity: item.quantity, unitCostSantim: product.unitCostSantim }; }) },
        } });
        created.push({ id: order.id, orderNumber: order.orderNumber });
        if (ownerAccount) await tx.notification.create({ data: { userId: ownerAccount.id, title: 'New marketplace order', body: `${order.orderNumber} was placed with ${shop.name}.`, href: '/owner?view=orders' } });
      }
      return created;
    });
    return NextResponse.json({ ok: true, orders });
  } catch (error: any) {
    return NextResponse.json({ error: error?.issues?.[0]?.message || error?.message || 'Unable to place an order.' }, { status: 400 });
  }
}
