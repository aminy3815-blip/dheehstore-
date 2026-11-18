import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { OwnerDashboard } from '@/components/OwnerDashboard';
import { addAddisDays, getAddisDateKey, getAddisDateStart, getAddisDateParts, getAddisMonthStart, getAddisYearStart, getFinanceRange, matchesFinanceRange } from '@/lib/finance-report';
import { decryptBankingValue } from '@/lib/banking-crypto';
import { ensureCommissionStatements, getAddisWeekStart } from '@/lib/weekly-commission';

export const dynamic = 'force-dynamic';

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function dateKey(value: Date) { return getAddisDateKey(value); }

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ view?: string; range?: string; from?: string; to?: string; status?: string }> }) {
  const owner = await getOwner();
  if (!owner) redirect('/login?next=/owner');
  const { view = 'overview', range, from, to, status } = await searchParams;
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
    case 'commission-collection': {
      const commissionShops = await db.shop.findMany({ select: { id: true } });
      for (const shop of commissionShops) {
        await db.$transaction((tx) => ensureCommissionStatements(tx, shop.id));
      }
      const [statements, submissions, sales, destinations] = await Promise.all([
        db.weeklyCommissionStatement.findMany({
          where: status === 'OVERDUE' ? { status: 'OVERDUE' } : {},
          take: 500,
          orderBy: [{ periodStart: 'desc' }, { shop: { name: 'asc' } }],
          include: {
            shop: { select: { id: true, name: true, owner: { select: { name: true, email: true } } } },
            paymentAllocations: { select: { amountSantim: true } },
            creditAllocations: { select: { amountSantim: true } },
          },
        }),
        db.commissionPaymentSubmission.findMany({
          take: 300,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, amountSantim: true, confirmedSantim: true, reference: true, method: true,
            destinationProvider: true, destinationLast4: true, status: true, rejectionReason: true, createdAt: true,
            shop: { select: { id: true, name: true } }, submitter: { select: { name: true } },
          },
        }),
        db.commissionSale.findMany({
          take: 300,
          orderBy: { eligibleAt: 'desc' },
          include: { order: { select: { orderNumber: true } }, product: { select: { name: true } }, shop: { select: { name: true } } },
        }),
        db.ownerCommissionDestination.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
      ]);
      const statementRows = statements.map((statement) => {
        const paidSantim = sum(statement.paymentAllocations.map((allocation) => allocation.amountSantim));
        const creditSantim = sum(statement.creditAllocations.map((allocation) => allocation.amountSantim));
        const shopSubmissions = submissions.filter((submission) => submission.shop.id === statement.shopId);
        return {
          ...statement,
          paidSantim,
          creditSantim,
          submittedSantim: sum(shopSubmissions
            .filter((submission) => submission.status === 'PENDING' || submission.status === 'AWAITING_VERIFICATION')
            .map((submission) => submission.amountSantim)),
          outstandingSantim: Math.max(0, statement.commissionSantim - paidSantim - creditSantim),
        };
      });
      const salesWithCredits = await Promise.all(sales.map(async (sale) => {
        const credits = await db.commissionCredit.aggregate({ where: { saleId: sale.id }, _sum: { refundSantim: true } });
        return {
          id: sale.id,
          orderId: sale.orderId,
          orderNumber: sale.order.orderNumber,
          orderItemId: sale.orderItemId,
          productName: sale.product.name,
          shopName: sale.shop.name,
          saleSantim: sale.saleSantim,
          creditedRefundSantim: credits._sum.refundSantim || 0,
        };
      }));
      data.commissionCollection = {
        statements: statementRows,
        submissions: submissions.map((submission) => ({
          ...submission,
          createdAt: submission.createdAt.toISOString(),
          shopName: submission.shop.name,
          sellerName: submission.submitter.name,
        })),
        sales: salesWithCredits,
        destinations: destinations.map((destination) => ({
          id: destination.id,
          provider: destination.provider,
          accountHolder: decryptBankingValue(destination.accountHolderEncrypted),
          accountNumber: decryptBankingValue(destination.accountNumberEncrypted),
          isDefault: destination.isDefault,
        })),
      };
      break;
    }
    case 'finances': {
      const selectedRange = getFinanceRange(range, from, to);
      const commissionShops = await db.shop.findMany({ select: { id: true } });
      for (const shop of commissionShops) {
        await db.$transaction((tx) => ensureCommissionStatements(tx, shop.id));
      }
      const [sales, payouts, ownerWallet, sellerPayouts, pendingDestinations] = await Promise.all([
        db.financialTransaction.findMany({ where: { kind: { in: ['SALE', 'DELIVERY'] } }, include: { order: { select: { paymentMethod: true } }, seller: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
        db.payoutRequest.findMany({ where: { userId: owner.id, status: 'SUCCEEDED' }, select: { amountSantim: true } }),
        db.financialWallet.findUnique({ where: { userId: owner.id } }),
        db.payoutRequest.findMany({ where: { status: 'SUCCEEDED', user: { role: 'PRODUCER' } }, select: { amountSantim: true } }),
        db.payoutDestination.findMany({ where: { status: 'PENDING' }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
      ]);
      const [weeklySales, weeklyStatements, weeklyRefunds] = await Promise.all([
        db.commissionSale.findMany({
          include: { shop: { select: { name: true } }, product: { select: { name: true } }, order: { select: { paymentMethod: true } } },
          orderBy: { eligibleAt: 'asc' },
        }),
        db.weeklyCommissionStatement.findMany({
          include: { paymentAllocations: { select: { amountSantim: true } }, creditAllocations: { select: { amountSantim: true } } },
        }),
        db.commissionCredit.aggregate({ _sum: { refundSantim: true } }),
      ]);
      const saleLines = sales.filter((transaction) => transaction.kind === 'SALE');
      const commissionEntries = [
        ...saleLines.map((transaction) => ({
          createdAt: transaction.createdAt,
          commissionSantim: transaction.commissionSantim,
          saleSantim: transaction.grossSaleSantim,
          shopName: transaction.seller?.name || 'Unknown shop',
          productName: '',
          paymentMethod: transaction.order?.paymentMethod || 'Unspecified',
          productId: transaction.productId,
        })),
        ...weeklySales.map((sale) => ({
          createdAt: sale.eligibleAt,
          commissionSantim: sale.commissionSantim,
          saleSantim: sale.saleSantim,
          shopName: sale.shop.name,
          productName: sale.product.name,
          paymentMethod: sale.order.paymentMethod,
          productId: sale.productId,
        })),
      ];
      const pendingCodIds = saleLines.filter((transaction) => transaction.settlementStatus === 'PENDING' && transaction.order?.paymentMethod === 'COD').map((transaction) => transaction.id);
      const codCollections = pendingCodIds.length ? await db.financialTransaction.aggregate({
        where: { kind: 'COD_COMMISSION_COLLECTION', reversesId: { in: pendingCodIds } },
        _sum: { commissionSantim: true },
      }) : null;
      const now = new Date();
      const dayStart = getAddisDateStart(now);
      const weekStart = new Date(now.getTime() - 7 * 86400000);
      const thirtyDays = new Date(now.getTime() - 30 * 86400000);
      const monthStart = getAddisMonthStart(now);
      const yearStart = getAddisYearStart(now);
      const totalCommission = sum(commissionEntries.map((transaction) => transaction.commissionSantim));
      const inPeriod = sales.filter((transaction) => matchesFinanceRange(transaction.createdAt, selectedRange));
      const reportSales = commissionEntries.filter((transaction) => matchesFinanceRange(transaction.createdAt, selectedRange));
      const dailyStart = addAddisDays(dayStart, -29);
      const daily = Array.from({ length: 30 }, (_, index) => {
        const day = addAddisDays(dailyStart, index);
        const value = sum(commissionEntries.filter((transaction) => dateKey(transaction.createdAt) === dateKey(day)).map((transaction) => transaction.commissionSantim));
        return { label: dateKey(day).slice(5), value };
      });
      const currentWeek = getAddisWeekStart(now);
      const weeklyStart = new Date(currentWeek.getTime() - 11 * 7 * 86400000);
      const weekly = Array.from({ length: 12 }, (_, index) => {
        const week = new Date(weeklyStart.getTime() + index * 7 * 86400000);
        const end = new Date(week.getTime() + 7 * 86400000);
        const value = sum(commissionEntries.filter((transaction) => transaction.createdAt >= week && transaction.createdAt < end).map((transaction) => transaction.commissionSantim));
        return { label: dateKey(week).slice(5), value };
      });
      const months = Array.from({ length: 12 }, (_, index) => getAddisMonthStart(now, index - 11));
      const monthly = months.map((month, index) => {
        const end = getAddisMonthStart(now, index - 10);
        return {
          label: month.toLocaleString('en', { month: 'short', timeZone: 'Africa/Addis_Ababa' }),
          value: sum(commissionEntries.filter((transaction) => transaction.createdAt >= month && transaction.createdAt < end).map((transaction) => transaction.commissionSantim)),
        };
      });
      const currentYear = getAddisDateParts(now).year;
      const years = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);
      const annual = years.map((year) => ({
        label: String(year),
        value: sum(commissionEntries.filter((transaction) =>
          transaction.createdAt >= getAddisYearStart(now, year - currentYear) &&
          transaction.createdAt < getAddisYearStart(now, year - currentYear + 1),
        ).map((transaction) => transaction.commissionSantim)),
      }));
      const groupBy = (keyOf: (transaction: typeof reportSales[number]) => string) => {
        const grouped = new Map<string, number>();
        for (const transaction of reportSales) {
          const key = keyOf(transaction);
          grouped.set(key, (grouped.get(key) || 0) + transaction.commissionSantim);
        }
        return [...grouped].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 20);
      };
      const refunded = sum(sales.map((transaction) => transaction.refundSantim)) + (weeklyRefunds._sum.refundSantim || 0);
      const collectedCommission = sum(weeklyStatements.flatMap((statement) => statement.paymentAllocations.map((allocation) => allocation.amountSantim)));
      const refundCredits = sum(weeklyStatements.flatMap((statement) => statement.creditAllocations.map((allocation) => allocation.amountSantim)));
      const weeklyOutstanding = sum(weeklyStatements.map((statement) => Math.max(
        0,
        statement.commissionSantim -
          sum(statement.paymentAllocations.map((allocation) => allocation.amountSantim)) -
          sum(statement.creditAllocations.map((allocation) => allocation.amountSantim)),
      )));
      const overdueCommission = sum(weeklyStatements
        .filter((statement) => statement.deadline < now)
        .map((statement) => Math.max(
          0,
          statement.commissionSantim -
            sum(statement.paymentAllocations.map((allocation) => allocation.amountSantim)) -
            sum(statement.creditAllocations.map((allocation) => allocation.amountSantim)),
        )));
      data.finance = {
        range: selectedRange.key,
        from: selectedRange.from ? getAddisDateKey(selectedRange.from) : '',
        to: selectedRange.to ? getAddisDateKey(new Date(selectedRange.to.getTime() - 1)) : '',
        totalSalesSantim: sum(sales.map((transaction) => transaction.grossSaleSantim)),
        commissionableSalesSantim: sum(commissionEntries.map((transaction) => transaction.saleSantim)),
        totalCommissionSantim: totalCommission,
        todayCommissionSantim: sum(commissionEntries.filter((transaction) => transaction.createdAt >= dayStart).map((transaction) => transaction.commissionSantim)),
        sevenDayCommissionSantim: sum(commissionEntries.filter((transaction) => transaction.createdAt >= weekStart).map((transaction) => transaction.commissionSantim)),
        thirtyDayCommissionSantim: sum(commissionEntries.filter((transaction) => transaction.createdAt >= thirtyDays).map((transaction) => transaction.commissionSantim)),
        monthlyCommissionSantim: sum(commissionEntries.filter((transaction) => transaction.createdAt >= monthStart).map((transaction) => transaction.commissionSantim)),
        annualCommissionSantim: sum(commissionEntries.filter((transaction) => transaction.createdAt >= yearStart).map((transaction) => transaction.commissionSantim)),
        lifetimeCommissionSantim: totalCommission,
        pendingCommissionSantim: Math.max(0,
          weeklyOutstanding +
          sum(saleLines.filter((transaction) => transaction.settlementStatus === 'PENDING').map((transaction) => transaction.commissionSantim)) -
          (codCollections?._sum.commissionSantim || 0)),
        commissionCollectedSantim: collectedCommission,
        commissionOutstandingSantim: weeklyOutstanding,
        overdueCommissionSantim: overdueCommission,
        commissionRefundCreditsSantim: refundCredits,
        availableWithdrawalSantim: ownerWallet?.availableSantim ?? 0,
        pendingWithdrawalSantim: ownerWallet?.pendingSantim ?? 0,
        withdrawnSantim: sum(payouts.map((payout) => payout.amountSantim)),
        sellerSettlementsSantim: sum(sellerPayouts.map((payout) => payout.amountSantim)),
        refundsSantim: refunded,
        chargebacksSantim: 0,
        reportSalesSantim: sum(inPeriod.map((transaction) => transaction.grossSaleSantim)),
        reportCommissionableSalesSantim: sum(reportSales.map((transaction) => transaction.saleSantim)),
        reportCommissionSantim: sum(reportSales.map((transaction) => transaction.commissionSantim)),
        daily,
        weekly,
        monthly,
        annual,
        byShop: groupBy((transaction) => transaction.shopName),
        byProduct: groupBy((transaction) => transaction.productName || 'Historical ledger item'),
        byMethod: groupBy((transaction) => transaction.paymentMethod),
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
