import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import { redirect } from 'next/navigation';
import { ProductForm, OrderStatusButton, ProductManage } from '@/components/SellerControls';
import { WeeklyCommissionPanel } from '@/components/WeeklyCommissionPanel';
import { decryptBankingValue } from '@/lib/banking-crypto';
import { ensureCommissionStatements, getAddisWeekPeriod, getAddisWeekStart } from '@/lib/weekly-commission';

export const dynamic = 'force-dynamic';

export default async function Seller() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.role !== 'PRODUCER' || !user.shop) redirect('/');
  const shop = user.shop;
  const [categories, products, orders] = await Promise.all([
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.product.findMany({ where: { shopId: shop.id }, include: { category: true }, orderBy: { createdAt: 'desc' } }),
    db.order.findMany({ where: { shopId: shop.id }, include: { items: true, user: true, address: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  const now = new Date();
  const currentWeekStart = getAddisWeekStart(now);
  const commissionData = await db.$transaction(async (tx) => {
    const statements = await ensureCommissionStatements(tx, shop.id, now);
    const [currentSales, submissions, destinations] = await Promise.all([
      tx.commissionSale.aggregate({
        where: { shopId: shop.id, periodStart: currentWeekStart },
        _sum: { saleSantim: true, commissionSantim: true },
      }),
      tx.commissionPaymentSubmission.findMany({
        where: { shopId: shop.id },
        select: {
          id: true, method: true, destinationLast4: true, amountSantim: true, confirmedSantim: true,
          reference: true, status: true, rejectionReason: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      tx.ownerCommissionDestination.findMany({
        select: { id: true, provider: true, accountHolderEncrypted: true, accountNumberEncrypted: true, accountLast4: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    const statementDetails = await Promise.all(statements.map(async (statement) => {
      const [paid, credited] = await Promise.all([
        tx.commissionPaymentAllocation.aggregate({ where: { statementId: statement.id }, _sum: { amountSantim: true } }),
        tx.commissionCreditAllocation.aggregate({ where: { statementId: statement.id }, _sum: { amountSantim: true } }),
      ]);
      const paidSantim = paid._sum.amountSantim || 0;
      const creditSantim = credited._sum.amountSantim || 0;
      return {
        id: statement.id,
        periodStart: statement.periodStart.toISOString(),
        periodEnd: statement.periodEnd.toISOString(),
        deadline: statement.deadline.toISOString(),
        salesSantim: statement.salesSantim,
        commissionSantim: statement.commissionSantim,
        carriedSantim: statement.carriedSantim,
        totalDueSantim: statement.totalDueSantim,
        paidSantim,
        creditSantim,
        outstandingSantim: Math.max(0, statement.commissionSantim - paidSantim - creditSantim),
        status: statement.status,
      };
    }));
    return {
      statements: statementDetails,
      currentSalesSantim: currentSales._sum.saleSantim || 0,
      currentCommissionSantim: currentSales._sum.commissionSantim || 0,
      previousOutstandingSantim: statementDetails
        .filter((statement) => new Date(statement.periodStart) < currentWeekStart)
        .reduce((sum, statement) => sum + statement.outstandingSantim, 0),
      totalOutstandingSantim: statementDetails.reduce((sum, statement) => sum + statement.outstandingSantim, 0),
      submissions: submissions.map((submission) => ({ ...submission, createdAt: submission.createdAt.toISOString() })),
      destinations: destinations.map((destination) => ({
        id: destination.id,
        provider: destination.provider,
        accountHolder: decryptBankingValue(destination.accountHolderEncrypted),
        accountNumber: decryptBankingValue(destination.accountNumberEncrypted),
        isDefault: destination.isDefault,
      })),
    };
  });
  const paymentDeadline = getAddisWeekPeriod(currentWeekStart).deadline.toISOString();
  const pending = orders.filter((order) => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(order.status)).length;
  const revenue = orders.filter((order) => order.paymentStatus === 'PAID').reduce((sum, order) => sum + order.total, 0);

  return <main className="wrap pageContent">
    <div className="dashHead">
      <div><div className="eyebrow">SELLER STUDIO</div><h1>{shop.name}</h1><p>{shop.city} · {shop.status === 'APPROVED' ? 'Shop active' : 'Application pending review'}</p></div>
      <div className="sellerLinks"><a className="textLink" href="/seller/banking">BANKING &amp; PAYMENTS ↗</a><a className="textLink" href={`/shops/${shop.slug}`}>View shop ↗</a></div>
    </div>
    {shop.status !== 'APPROVED' && <div className="infoBox">Your producer application is <b>{shop.status.toLowerCase()}</b>. You can prepare your shop and listings; product publishing becomes available after administrator approval.</div>}
    <div className="statsGrid">
      <div><small>LISTINGS</small><b>{products.length}</b></div><div><small>ORDERS</small><b>{orders.length}</b></div>
      <div><small>NEEDS ATTENTION</small><b>{pending}</b></div><div><small>PAID SALES</small><b>{money(revenue)}</b></div>
    </div>
    <WeeklyCommissionPanel {...commissionData} paymentDeadline={paymentDeadline}/>
    <div className="dashboardGrid">
      <section className="dashPanel">
        <div className="sectionIntro"><div><div className="eyebrow">YOUR CATALOGUE</div><h2>Product listings</h2></div></div>
        {products.length ? products.map((product) => <div className="sellerProduct" key={product.id}>
          <img src={product.imageUrl} alt=""/><div><b>{product.name}</b><small>{product.category.name} · {product.stock} in stock · Production cost: {product.unitCostSantim === null ? 'not set' : money(product.unitCostSantim / 100)}</small></div>
          <strong>{money(product.price)}</strong>
          <ProductManage id={product.id} name={product.name} price={product.price} unitCostSantim={product.unitCostSantim} stock={product.stock} available={product.available}/>
        </div>) : <p className="muted">No products yet.</p>}
        <h3>Add a product</h3><ProductForm categories={categories}/>
      </section>
      <section className="dashPanel">
        <div className="eyebrow">FULFILMENT</div><h2>Recent orders</h2>
        {orders.length ? orders.map((order) => <div className="sellerOrder" key={order.id}>
          <div className="orderTop"><b>{order.orderNumber}</b><span className="statusPill">{order.status.replaceAll('_', ' ')}</span></div>
          <p>{order.user.name} · {order.address.city} · {order.address.phone}</p>
          {order.items.map((item) => <small key={item.id}>{item.quantity} × {item.name}</small>)}
          <b>{money(order.total)}</b><OrderStatusButton id={order.id} status={order.status}/>
        </div>) : <p className="muted">Orders from customers will appear here.</p>}
      </section>
    </div>
  </main>;
}
