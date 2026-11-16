import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getOwner } from '@/lib/auth';
import { recordPaidOrder } from '@/lib/finance-ledger';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seller-status'), id: z.string(), status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']) }),
  z.object({ action: z.literal('user-status'), id: z.string(), status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('product-status'), id: z.string(), available: z.boolean() }),
  z.object({ action: z.literal('verify-bank-transfer'), id: z.string(), reference: z.string().min(4).max(100) }),
  z.object({ action: z.literal('complaint-status'), id: z.string(), status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']), resolution: z.string().max(2000).optional() }),
  z.object({ action: z.literal('commission-global'), basisPoints: z.number().int().min(0).max(2500) }),
  z.object({ action: z.literal('commission-net-profit'), basisPoints: z.number().int().min(0).max(10000) }),
  z.object({ action: z.literal('commission-category'), categoryId: z.string(), basisPoints: z.number().int().min(0).max(5000) }),
  z.object({ action: z.literal('marketplace-settings'), platformName: z.string().min(3).max(80), supportEmail: z.email().or(z.literal('')) }),
  z.object({ action: z.literal('notification-read'), id: z.string() }),
]);

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  try {
    const data = schema.parse(await req.json());
    const result = await db.$transaction(async (tx) => {
      let entity: string = data.action;
      let entityId: string | undefined;
      let details = '';
      switch (data.action) {
        case 'seller-status': {
          const shop = await tx.shop.findUniqueOrThrow({ where: { id: data.id } });
          await tx.shop.update({ where: { id: data.id }, data: { status: data.status } });
          entity = 'shop'; entityId = data.id; details = `${shop.name}: ${data.status}`;
          break;
        }
        case 'user-status': {
          if (data.id === owner.id) throw new Error('You cannot suspend your own owner account.');
          const target = await tx.user.findUniqueOrThrow({ where: { id: data.id } });
          if (target.role === 'OWNER' || target.role === 'ADMIN') throw new Error('Owner and system accounts cannot be changed here.');
          await tx.user.update({ where: { id: data.id }, data: { accountStatus: data.status, suspensionReason: data.status === 'SUSPENDED' ? (data.reason || 'Suspended by owner') : null } });
          entity = 'user'; entityId = data.id; details = `${target.email}: ${data.status}`;
          break;
        }
        case 'product-status': {
          const product = await tx.product.findUniqueOrThrow({ where: { id: data.id } });
          await tx.product.update({ where: { id: data.id }, data: { available: data.available } });
          entity = 'product'; entityId = data.id; details = `${product.name}: ${data.available ? 'relisted' : 'paused'}`;
          break;
        }
        case 'verify-bank-transfer': {
          const order = await tx.order.findUniqueOrThrow({ where: { id: data.id } });
          if (order.paymentMethod !== 'BANK_TRANSFER') throw new Error('Only bank transfers can be manually verified.');
          if (order.paymentStatus === 'PAID') throw new Error('This payment is already marked as paid.');
          await tx.order.update({ where: { id: data.id }, data: { paymentStatus: 'PAID', transactionRef: data.reference } });
          await recordPaidOrder(tx, order.id, null);
          entity = 'payment'; entityId = data.id; details = `Verified bank transfer for ${order.orderNumber}`;
          break;
        }
        case 'complaint-status': {
          await tx.complaint.update({ where: { id: data.id }, data: { status: data.status, resolution: data.resolution || null } });
          entity = 'complaint'; entityId = data.id; details = `Complaint marked ${data.status}`;
          break;
        }
        case 'commission-global': {
          await tx.marketplaceSettings.upsert({ where: { id: 'marketplace' }, update: { globalCommissionBps: data.basisPoints }, create: { id: 'marketplace', globalCommissionBps: data.basisPoints } });
          entity = 'settings'; details = `Global commission set to ${data.basisPoints} basis points. Collection remains inactive.`;
          break;
        }
        case 'commission-category': {
          await tx.categoryCommission.upsert({ where: { categoryId: data.categoryId }, update: { commissionBps: data.basisPoints }, create: { categoryId: data.categoryId, commissionBps: data.basisPoints } });
          entity = 'category-commission'; entityId = data.categoryId; details = `Category commission set to ${data.basisPoints} basis points.`;
          break;
        }
        case 'commission-net-profit': {
          await tx.marketplaceSettings.upsert({
            where: { id: 'marketplace' },
            update: { netProfitCommissionBps: data.basisPoints },
            create: { id: 'marketplace', netProfitCommissionBps: data.basisPoints },
          });
          entity = 'settings'; details = `Net-profit commission set to ${data.basisPoints} basis points.`;
          break;
        }
        case 'marketplace-settings': {
          await tx.marketplaceSettings.upsert({ where: { id: 'marketplace' }, update: { platformName: data.platformName, supportEmail: data.supportEmail || null }, create: { id: 'marketplace', platformName: data.platformName, supportEmail: data.supportEmail || null } });
          entity = 'settings'; details = 'Marketplace settings updated.';
          break;
        }
        case 'notification-read': {
          await tx.notification.updateMany({ where: { id: data.id, userId: owner.id }, data: { readAt: new Date() } });
          entity = 'notification'; entityId = data.id; details = 'Owner notification marked as read.';
          break;
        }
      }
      await tx.activityLog.create({ data: { actorId: owner.id, action: data.action, entity, entityId, details } });
      return { ok: true };
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.issues?.[0]?.message || error?.message || 'Owner action failed.' }, { status: 400 });
  }
}
