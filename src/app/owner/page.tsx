import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { OwnerDashboard } from '@/components/OwnerDashboard';
import { getFinanceRange, matchesFinanceRange } from '@/lib/finance-report';
import { decryptBankingValue } from '@/lib/banking-crypto';

export const dynamic = 'force-dynamic';

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; from?: string; to?: string }> }) {
  const owner = await getOwner();
  if (!owner) redirect('/login?next=/owner');
  const { view = 'overview', range, from, to } = await searchParams;
  const [settings, users, shops, products, orders, paidAggregate, pendingSellers, pendingPayments, openComplaints, unreadCount, recentOrders] = await Promise.all([
    db.marketplaceSettings.upsert({ where: { id: 'marketplace' }, update: {}, create: { id: 'marketplace', platformName: 'DHEEHSTORE', globalCommissionBps: 0 } }),
    db.user.count(),
    db.shop.count({ where: { status: 'APPROVED' } }),
    db.product.count(),
    db.order.count(),
    db.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
    db.shop.count({ where: { status: 'PENDING' } }),
    db.order.count({ where: { paymentStatus: { in: ['UNPAID', 'PENDING'] } } }),
    db.complaint.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    db.notification.count({ where: { userId: owner.id, readAt: null } }),
    db.order.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { user: true, shop: true } }),
  ]);
  const data: any = {
    metrics: { users, shops, products, orders, paidTotal: paidAggregate._sum.total || 0 },
    pendingSellers, pendingPayments, openComplaints, unreadCount, recentOrders, settings,
  };
  switch (view) {
    case 'sellers': data.sellers = await db.shop.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { owner: true, _count: { select: { products: true, orders: true } } } }); break;
    case 'customers': data.customers = await db.user.findMany({ where: { role: 'CUSTOMER' }, take: 300, orderBy: { createdAt: 'desc' }, include: { _count: { select: { orders: true } } } }); break;
    case 'products': data.products = await db.product.findMany({ take: 300, orderBy: { createdAt: 'desc' }, include: { shop: true, category: true } }); break;
    case 'orders': data.orders = await db.order.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { user: true, shop: true, address: true, items: true } }); break;
    case 'payments': data.payments = await db.order.findMany({ take: 300, orderBy: { createdAt: 'desc' }, include: { user: true } }); break;
    case 'finances': {
      const selectedRange = getFinanceRange(range, from, to);
      const [sales, payouts, ownerWallet, sellerPayouts, pendingDestinations] = await Promise.all([
        db.financialTransaction.findMany({ where: { kind: { in: ['SALE', 'DELIVERY'] } }, include: { order: { select: { paymentMethod: true } }, seller: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
        db.payoutRequest.findMany({ where: { userId: owner.id, status: 'SUCCEEDED' }, select: { amountSantim: true } }),
        db.financialWallet.findUnique({ where: { userId: owner.id } }),
        db.payoutRequest.findMany({ where: { status: 'SUCCEEDED', user: { role: 'PRODUCER' } }, select: { amountSantim: true } }),
        db.payoutDestination.findMany({ where: { status: 'PENDING' }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
      ]);
      const saleLines = sales.filter((transaction) => transaction.kind === 'SALE');
      const pendingCodIds = saleLines.filter((transaction) => transaction.settlementStatus === 'PENDING' && transaction.order?.paymentMethod === 'COD').map((transaction) => transaction.id);
      const codCollections = pendingCodIds.length ? await db.financialTransaction.aggregate({
        where: { kind: 'COD_COMMISSION_COLLECTION', reversesId: { in: pendingCodIds } },
        _sum: { commissionSantim: true },
      }) : null;
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 86400000);
      const thirtyDays = new Date(now.getTime() - 30 * 86400000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const totalCommission = sum(saleLines.map((transaction) => transaction.commissionSantim));
      const inPeriod = sales.filter((transaction) => matchesFinanceRange(transaction.createdAt, selectedRange));
      const reportSales = inPeriod.filter((transaction) => transaction.kind === 'SALE');
      const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      const daily = Array.from({ length: 30 }, (_, index) => {
        const day = new Date(dailyStart.getFullYear(), dailyStart.getMonth(), dailyStart.getDate() + index);
        const value = sum(saleLines.filter((transaction) => dateKey(transaction.createdAt) === dateKey(day)).map((transaction) => transaction.commissionSantim));
        return { label: dateKey(day).slice(5), value };
      });
      const currentWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      const weeklyStart = new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() - 11 * 7);
      const weekly = Array.from({ length: 12 }, (_, index) => {
        const week = new Date(weeklyStart.getFullYear(), weeklyStart.getMonth(), weeklyStart.getDate() + index * 7);
        const end = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7);
        const value = sum(saleLines.filter((transaction) => transaction.createdAt >= week && transaction.createdAt < end).map((transaction) => transaction.commissionSantim));
        return { label: dateKey(week).slice(5), value };
      });
      const months = Array.from({ length: 12 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 11 + index, 1));
      const monthly = months.map((month) => ({
        label: month.toLocaleString('en', { month: 'short' }),
        value: sum(saleLines.filter((transaction) => transaction.createdAt.getFullYear() === month.getFullYear() && transaction.createdAt.getMonth() === month.getMonth()).map((transaction) => transaction.commissionSantim)),
      }));
      const years = Array.from({ length: 5 }, (_, index) => now.getFullYear() - 4 + index);
      const annual = years.map((year) => ({
        label: String(year),
        value: sum(saleLines.filter((transaction) => transaction.createdAt.getFullYear() === year).map((transaction) => transaction.commissionSantim)),
      }));
      const groupBy = (keyOf: (transaction: typeof reportSales[number]) => string) => {
        const grouped = new Map<string, number>();
        for (const transaction of reportSales) {
          const key = keyOf(transaction);
          grouped.set(key, (grouped.get(key) || 0) + transaction.commissionSantim);
        }
        return [...grouped].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 20);
      };
      const productIds = [...new Set(reportSales.map((transaction) => transaction.productId).filter((id): id is string => Boolean(id)))];
      const productNames = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
      const nameByProduct = new Map(productNames.map((product) => [product.id, product.name]));
      const eligibleProfit = sum(saleLines.map((transaction) => transaction.eligibleProfitSantim));
      const refunded = sum(sales.map((transaction) => transaction.refundSantim));
      data.finance = {
        range: selectedRange.key,
        from: selectedRange.from?.toISOString().slice(0, 10) || '',
        to: selectedRange.to ? new Date(selectedRange.to.getTime() - 86400000).toISOString().slice(0, 10) : '',
        totalSalesSantim: sum(sales.map((transaction) => transaction.grossSaleSantim)),
        eligibleProfitSantim: eligibleProfit,
        totalCommissionSantim: totalCommission,
        todayCommissionSantim: sum(saleLines.filter((transaction) => transaction.createdAt >= dayStart).map((transaction) => transaction.commissionSantim)),
        sevenDayCommissionSantim: sum(saleLines.filter((transaction) => transaction.createdAt >= weekStart).map((transaction) => transaction.commissionSantim)),
        thirtyDayCommissionSantim: sum(saleLines.filter((transaction) => transaction.createdAt >= thirtyDays).map((transaction) => transaction.commissionSantim)),
        monthlyCommissionSantim: sum(saleLines.filter((transaction) => transaction.createdAt >= monthStart).map((transaction) => transaction.commissionSantim)),
        annualCommissionSantim: sum(saleLines.filter((transaction) => transaction.createdAt >= yearStart).map((transaction) => transaction.commissionSantim)),
        lifetimeCommissionSantim: totalCommission,
        pendingCommissionSantim: Math.max(0,
          sum(saleLines.filter((transaction) => transaction.settlementStatus === 'PENDING').map((transaction) => transaction.commissionSantim)) -
          (codCollections?._sum.commissionSantim || 0)),
        availableWithdrawalSantim: ownerWallet?.availableSantim ?? 0,
        pendingWithdrawalSantim: ownerWallet?.pendingSantim ?? 0,
        withdrawnSantim: sum(payouts.map((payout) => payout.amountSantim)),
        sellerSettlementsSantim: sum(sellerPayouts.map((payout) => payout.amountSantim)),
        refundsSantim: refunded,
        chargebacksSantim: 0,
        reportSalesSantim: sum(inPeriod.map((transaction) => transaction.grossSaleSantim)),
        reportProfitSantim: sum(reportSales.map((transaction) => transaction.eligibleProfitSantim)),
        reportCommissionSantim: sum(reportSales.map((transaction) => transaction.commissionSantim)),
        daily,
        weekly,
        monthly,
        annual,
        byShop: groupBy((transaction) => transaction.seller?.name || 'Unknown shop'),
        byProduct: groupBy((transaction) => nameByProduct.get(transaction.productId || '') || 'Unknown product'),
        byMethod: groupBy((transaction) => transaction.order?.paymentMethod || 'Unspecified'),
        destinations: pendingDestinations.map((destination) => ({
          id: destination.id,
          userName: destination.user.name,
          userEmail: destination.user.email,
          provider: destination.provider,
          destinationType: destination.destinationType,
          accountHolder: decryptBankingValue(destination.accountHolderEncrypted),
          accountLast4: destination.accountLast4,
          status: destination.status,
        })),
        commissionBps: settings.netProfitCommissionBps,
      };
      break;
    }
    case 'commissions': data.categories = await db.category.findMany({ orderBy: { name: 'asc' }, include: { commission: true } }); break;
    case 'complaints': data.complaints = await db.complaint.findMany({ take: 300, orderBy: { createdAt: 'desc' }, include: { reporter: { select: { name: true, email: true } } } }); break;
    case 'notifications': data.notifications = await db.notification.findMany({ where: { userId: owner.id }, take: 100, orderBy: { createdAt: 'desc' } }); break;
    case 'activity': data.activity = await db.activityLog.findMany({ take: 200, orderBy: { createdAt: 'desc' }, include: { actor: { select: { email: true } } } }); break;
  }
  return <OwnerDashboard owner={{ name: owner.name, email: owner.email }} view={view} data={data}/>;
}
