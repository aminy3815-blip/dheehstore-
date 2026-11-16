import { money, moneySantim } from '@/lib/format';
import { CategoryCommissionForm, CommissionForm, MarketplaceSettingsForm, NetProfitCommissionForm, OwnerAction, OwnerChoice, OwnerPaymentVerify, PasswordChangeForm } from './OwnerControls';
import { BankingPanel } from './BankingPanel';
import { OwnerDestinationReview } from './OwnerFinanceControls';

const sections = [
  ['overview', 'Overview'], ['sellers', 'Sellers'], ['customers', 'Customers'], ['products', 'Products'], ['orders', 'Orders'], ['payments', 'Payments'], ['finances', 'DHEEHSTORE Financial Center'], ['commissions', 'Commission settings'], ['complaints', 'Complaints'], ['notifications', 'Notifications'], ['activity', 'Activity log'], ['settings', 'Marketplace settings'],
];
const date = (value: Date | string) => new Date(value).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' });
const commissionPercent = (bps: number) => (bps / 100).toLocaleString('en', { maximumFractionDigits: 2 });

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="ownerTableWrap"><table className="ownerTable"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Empty({ text }: { text: string }) { return <div className="ownerEmpty">{text}</div>; }
function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) { return <article className="ownerStat"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</article>; }

export function OwnerDashboard({ owner, view, data }: { owner: any; view: string; data: any }) {
  const activeView = sections.some(([key]) => key === view) ? view : 'overview';
  const title = sections.find(([key]) => key === activeView)?.[1] || 'Overview';
  return <main className="ownerShell">
    <div className="ownerHeading"><div><div className="eyebrow">DHEEHSTORE · OWNER CONSOLE</div><h1>{title}</h1><p>Marketplace operations and financial oversight</p></div><div className="ownerIdentity"><span className="ownerAvatar">DS</span><div><b>{owner.name}</b><small>{owner.email}</small></div></div></div>
    <nav className="ownerNav" aria-label="Owner dashboard sections">{sections.map(([key, label]) => <a key={key} className={activeView === key ? 'active' : ''} href={`/owner?view=${key}`}>{label}{key === 'notifications' && data.unreadCount > 0 && <b className="navCount">{data.unreadCount}</b>}</a>)}</nav>
    <div className="ownerStats">
      <Stat label="REGISTERED USERS" value={data.metrics.users}/><Stat label="ACTIVE SHOPS" value={data.metrics.shops}/><Stat label="PRODUCT LISTINGS" value={data.metrics.products}/><Stat label="ALL ORDERS" value={data.metrics.orders}/><Stat label="PAID ORDER VOLUME" value={money(data.metrics.paidTotal)} hint="Recorded as paid in the database"/>
    </div>
    {activeView === 'overview' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">LIVE OPERATIONS</div><h2>Recent marketplace activity</h2></div><a href="/owner?view=orders">All orders →</a></div><div className="ownerQuickGrid"><a href="/owner?view=sellers"><span>Seller applications</span><b>{data.pendingSellers}</b><small>Waiting for review ↗</small></a><a href="/owner?view=payments"><span>Pending payments</span><b>{data.pendingPayments}</b><small>Requires verification ↗</small></a><a href="/owner?view=complaints"><span>Open complaints</span><b>{data.openComplaints}</b><small>View support queue ↗</small></a><a href="/owner?view=notifications"><span>Unread alerts</span><b>{data.unreadCount}</b><small>Owner notifications ↗</small></a></div><div className="ownerSubhead"><h3>Latest orders</h3><a href="/owner?view=orders">View monitoring →</a></div>{data.recentOrders.length ? <Table headers={['Order', 'Customer', 'Shop', 'Status', 'Payment', 'Total', 'Placed']}>{data.recentOrders.map((order: any) => <tr key={order.id}><td><b>{order.orderNumber}</b></td><td>{order.user.name}</td><td>{order.shop.name}</td><td><span className="ownerBadge">{order.status.replaceAll('_', ' ')}</span></td><td>{order.paymentStatus.replaceAll('_', ' ')}</td><td>{money(order.total)}</td><td>{date(order.createdAt)}</td></tr>)}</Table> : <Empty text="No orders have been placed yet."/>}</section>}
    {activeView === 'sellers' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">SELLER MANAGEMENT</div><h2>Shops and producer applications</h2></div><span>{data.sellers.length} total</span></div>{data.sellers.length ? <Table headers={['Shop', 'Owner', 'Location', 'Products', 'Orders', 'Status', 'Action']}>{data.sellers.map((shop: any) => <tr key={shop.id}><td><b>{shop.name}</b><small>{date(shop.createdAt)}</small></td><td>{shop.owner.name}<small>{shop.owner.email}</small></td><td>{shop.city}{shop.district ? ` · ${shop.district}` : ''}</td><td>{shop._count.products}</td><td>{shop._count.orders}</td><td><span className={`ownerBadge ${shop.status.toLowerCase()}`}>{shop.status}</span></td><td><OwnerChoice action="seller-status" id={shop.id} current={shop.status} options={['APPROVED', 'REJECTED', 'SUSPENDED']}/></td></tr>)}</Table> : <Empty text="No producer shops are registered yet."/>}</section>}
    {activeView === 'customers' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">CUSTOMER MANAGEMENT</div><h2>Customer accounts</h2></div><span>{data.customers.length} accounts</span></div>{data.customers.length ? <Table headers={['Customer', 'Phone', 'Joined', 'Orders', 'Account', 'Action']}>{data.customers.map((customer: any) => <tr key={customer.id}><td><b>{customer.name}</b><small>{customer.email}</small></td><td>{customer.phone || '—'}</td><td>{date(customer.createdAt)}</td><td>{customer._count.orders}</td><td><span className={`ownerBadge ${customer.accountStatus.toLowerCase()}`}>{customer.accountStatus}</span>{customer.suspensionReason && <small>{customer.suspensionReason}</small>}</td><td><OwnerChoice action="user-status" id={customer.id} current={customer.accountStatus} options={['ACTIVE', 'SUSPENDED']}/></td></tr>)}</Table> : <Empty text="No customer accounts yet."/>}</section>}
    {activeView === 'products' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">CATALOG OVERSIGHT</div><h2>Marketplace products</h2></div><span>{data.products.length} latest listings</span></div>{data.products.length ? <Table headers={['Product', 'Seller', 'Category', 'Price', 'Stock', 'Listed', 'Visibility']}>{data.products.map((product: any) => <tr key={product.id}><td><b>{product.name}</b><small>{product.condition}</small></td><td>{product.shop.name}<small>{product.shop.city}</small></td><td>{product.category.name}</td><td>{money(product.price)}</td><td>{product.stock}</td><td>{date(product.createdAt)}</td><td><OwnerAction payload={{ action: 'product-status', id: product.id, available: !product.available }} label={product.available ? 'Pause listing' : 'Restore listing'} danger={product.available}/></td></tr>)}</Table> : <Empty text="No products are listed yet."/>}</section>}
    {activeView === 'orders' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">ORDER MONITORING</div><h2>All seller orders</h2></div><span>Most recent 200</span></div>{data.orders.length ? <Table headers={['Order', 'Customer', 'Seller', 'Items', 'Delivery city', 'Fulfilment', 'Payment', 'Total', 'Date']}>{data.orders.map((order: any) => <tr key={order.id}><td><b>{order.orderNumber}</b></td><td>{order.user.name}<small>{order.user.email}</small></td><td>{order.shop.name}</td><td>{order.items.reduce((n: number, item: any) => n + item.quantity, 0)}</td><td>{order.address.city}</td><td><span className="ownerBadge">{order.status.replaceAll('_', ' ')}</span></td><td>{order.paymentMethod.replaceAll('_', ' ')}<small>{order.paymentStatus}</small></td><td>{money(order.total)}</td><td>{date(order.createdAt)}</td></tr>)}</Table> : <Empty text="No orders have been placed yet."/>}</section>}
    {activeView === 'payments' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">PAYMENT MONITORING</div><h2>Order payment records</h2></div><span>Gateway verification is not enabled</span></div>{data.payments.length ? <Table headers={['Order', 'Customer', 'Method', 'Amount', 'Status', 'Reference / action']}>{data.payments.map((order: any) => <tr key={order.id}><td><b>{order.orderNumber}</b><small>{date(order.createdAt)}</small></td><td>{order.user.name}<small>{order.user.email}</small></td><td>{order.paymentMethod.replaceAll('_', ' ')}</td><td>{money(order.total)}</td><td><span className={`ownerBadge ${order.paymentStatus.toLowerCase()}`}>{order.paymentStatus}</span></td><td>{order.paymentMethod === 'BANK_TRANSFER' && order.paymentStatus !== 'PAID' ? <OwnerPaymentVerify id={order.id} initialReference={order.transactionRef}/> : <small>{order.transactionRef || (['CHAPA', 'TELEBIRR', 'STRIPE'].includes(order.paymentMethod) && order.paymentStatus !== 'PAID' ? 'Waiting for provider integration' : '—')}</small>}</td></tr>)}</Table> : <Empty text="No order payments are recorded."/>}<p className="ownerNote">Only bank transfers can be manually verified here. Telebirr, Chapa, and Stripe require verified server-side provider integrations. This console never treats a gateway selection as proof of payment.</p></section>}
    {activeView === 'finances' && <div className="financeCenter">
      <section className="ownerPanel">
        <div className="ownerPanelTitle"><div><div className="eyebrow">DHEEHSTORE FINANCIAL CENTER</div><h2>Ledger-based financial overview</h2></div><span>ETB; values stored as santim</span></div>
        <div className="financeCards">
          <Stat label="MARKETPLACE SALES" value={moneySantim(data.finance.totalSalesSantim)}/>
          <Stat label="ELIGIBLE SELLER PROFIT" value={moneySantim(data.finance.eligibleProfitSantim)}/>
          <Stat label="LIFETIME COMMISSION" value={moneySantim(data.finance.lifetimeCommissionSantim)}/>
          <Stat label="TODAY'S COMMISSION" value={moneySantim(data.finance.todayCommissionSantim)}/>
          <Stat label="LAST 7 DAYS" value={moneySantim(data.finance.sevenDayCommissionSantim)}/>
          <Stat label="LAST 30 DAYS" value={moneySantim(data.finance.thirtyDayCommissionSantim)}/>
          <Stat label="THIS MONTH" value={moneySantim(data.finance.monthlyCommissionSantim)}/>
          <Stat label="THIS YEAR" value={moneySantim(data.finance.annualCommissionSantim)}/>
          <Stat label="PENDING COMMISSION" value={moneySantim(data.finance.pendingCommissionSantim)}/>
          <Stat label="AVAILABLE TO WITHDRAW" value={moneySantim(data.finance.availableWithdrawalSantim)}/>
          <Stat label="PENDING WITHDRAWAL" value={moneySantim(data.finance.pendingWithdrawalSantim)}/>
          <Stat label="TOTAL WITHDRAWN" value={moneySantim(data.finance.withdrawnSantim)}/>
          <Stat label="SELLER SETTLEMENTS" value={moneySantim(data.finance.sellerSettlementsSantim)}/>
          <Stat label="REFUNDS" value={moneySantim(data.finance.refundsSantim)}/>
          <Stat label="CHARGEBACKS" value={moneySantim(data.finance.chargebacksSantim)}/>
        </div>
        <div className="financeRate"><div><b>3% net-profit commission model</b><small>Commission uses paid sale amount minus private seller product cost. No commission is charged on zero or negative eligible profit.</small></div><NetProfitCommissionForm initialPercent={data.finance.commissionBps / 100}/></div>
      </section>
      <section className="ownerPanel">
        <div className="ownerPanelTitle"><div><div className="eyebrow">FINANCIAL REPORTING</div><h2>Filter and export ledger activity</h2></div><a className="ownerSmall" href={`/api/owner/finance/export?range=${data.finance.range}${data.finance.from ? `&from=${data.finance.from}` : ''}${data.finance.to ? `&to=${data.finance.to}` : ''}`}>Export CSV ↓</a></div>
        <form className="financeFilters" action="/owner">
          <input type="hidden" name="view" value="finances"/>
          <label>Reporting period<select name="range" defaultValue={data.finance.range}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="previous-month">Previous month</option><option value="year">This year</option><option value="previous-year">Previous year</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>
          <label>From<input type="date" name="from" defaultValue={data.finance.from}/></label>
          <label>To<input type="date" name="to" defaultValue={data.finance.to}/></label>
          <button className="goldBtn">Apply filters</button>
        </form>
        <div className="financeHero"><div><small>FILTERED MARKETPLACE SALES</small><strong>{moneySantim(data.finance.reportSalesSantim)}</strong></div><div><small>FILTERED ELIGIBLE PROFIT</small><strong>{moneySantim(data.finance.reportProfitSantim)}</strong></div><div><small>FILTERED COMMISSION</small><strong>{moneySantim(data.finance.reportCommissionSantim)}</strong></div></div>
        <MiniBars title="Daily commission · last 30 days" items={data.finance.daily}/>
        <MiniBars title="Weekly commission · last 12 weeks" items={data.finance.weekly}/>
        <MiniBars title="Monthly commission · last 12 months" items={data.finance.monthly}/>
        <MiniBars title="Annual commission · last 5 years" items={data.finance.annual}/>
        <div className="financeBreakdowns">
          <Breakdown title="Commission by shop" items={data.finance.byShop}/>
          <Breakdown title="Commission by product" items={data.finance.byProduct}/>
          <Breakdown title="Commission by payment method" items={data.finance.byMethod}/>
        </div>
        <p className="ownerNote">Reports include immutable ledger postings only; historical estimates and unpaid orders are excluded. Refunds/chargebacks are shown only when supported by a verified refund record.</p>
      </section>
      <OwnerDestinationReview destinations={data.finance.destinations}/>
      <BankingPanel isOwner/>
    </div>}
    {activeView === 'commissions' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">BUSINESS MODEL</div><h2>Commission configuration</h2></div><span>Rates are for reporting only</span></div><CommissionForm initialPercent={data.settings.globalCommissionBps / 100}/><h3 className="ownerSubheading">Category-specific rates</h3><Table headers={['Category', 'Current rate', 'Set rate']}>{data.categories.map((category: any) => <tr key={category.id}><td><b>{category.name}</b></td><td>{category.commission ? `${commissionPercent(category.commission.commissionBps)}%` : 'Uses global rate'}</td><td><CategoryCommissionForm categoryId={category.id} initialPercent={Number(commissionPercent(category.commission?.commissionBps ?? data.settings.globalCommissionBps))}/></td></tr>)}</Table><p className="ownerNote">Commission collection and seller payouts are inactive. These settings only inform financial estimates.</p></section>}
    {activeView === 'complaints' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">CUSTOMER SUPPORT</div><h2>Complaints and disputes</h2></div><span>{data.complaints.filter((complaint: any) => complaint.status === 'OPEN' || complaint.status === 'INVESTIGATING').length} unresolved</span></div>{data.complaints.length ? <div className="complaintList">{data.complaints.map((complaint: any) => <article className="complaintCard" key={complaint.id}><div className="complaintMeta"><span className={`ownerBadge ${complaint.status.toLowerCase()}`}>{complaint.status}</span><span>{date(complaint.createdAt)}</span><span>{complaint.reporter?.name || 'Account removed'} · {complaint.reporter?.email || ''}</span></div><h3>{complaint.subject}</h3><p>{complaint.message}</p>{complaint.orderNumber && <small>Order: {complaint.orderNumber}</small>}<div className="complaintActions"><OwnerChoice action="complaint-status" id={complaint.id} current={complaint.status} options={['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']}/><OwnerAction payload={{ action: 'complaint-status', id: complaint.id, status: 'RESOLVED', resolution: 'Reviewed and resolved by marketplace owner.' }} label="Resolve"/></div></article>)}</div> : <Empty text="No complaints have been filed."/>}</section>}
    {activeView === 'notifications' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">OWNER ALERTS</div><h2>Notifications</h2></div><span>{data.unreadCount} unread</span></div>{data.notifications.length ? <div className="ownerNotificationList">{data.notifications.map((notification: any) => <article className={`ownerNotification ${notification.readAt ? '' : 'unread'}`} key={notification.id}><div><small>{date(notification.createdAt)}</small><h3>{notification.title}</h3><p>{notification.body}</p></div><div>{notification.href && <a className="ownerSmall" href={notification.href}>Open</a>}{!notification.readAt && <OwnerAction payload={{ action: 'notification-read', id: notification.id }} label="Mark read"/>}</div></article>)}</div> : <Empty text="No owner notifications yet. New producer applications and complaints appear here."/>}</section>}
    {activeView === 'activity' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">AUDIT TRAIL</div><h2>Administrative activity</h2></div><span>Latest 200 entries</span></div>{data.activity.length ? <Table headers={['When', 'Owner', 'Action', 'Record', 'Details']}>{data.activity.map((entry: any) => <tr key={entry.id}><td>{date(entry.createdAt)}</td><td>{entry.actor?.email || 'System'}</td><td><b>{entry.action}</b></td><td>{entry.entity}{entry.entityId && <small>{entry.entityId}</small>}</td><td>{entry.details || '—'}</td></tr>)}</Table> : <Empty text="Owner actions will be recorded here."/>}</section>}
    {activeView === 'settings' && <section className="ownerPanel"><div className="ownerPanelTitle"><div><div className="eyebrow">MARKETPLACE CONFIGURATION</div><h2>Platform settings</h2></div></div><MarketplaceSettingsForm platformName={data.settings.platformName} supportEmail={data.settings.supportEmail || ''}/><div className="ownerDivider"/><div className="ownerPanelTitle"><div><div className="eyebrow">ACCOUNT SECURITY</div><h2>Change owner password</h2></div></div><PasswordChangeForm/></section>}
  </main>;
}

function MiniBars({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return <section className="financeChart">
    <h3>{title}</h3>
    <div className="financeBarList">{items.map((item, index) => <div className="financeBarItem" key={`${item.label}-${index}`} title={`${item.label}: ${moneySantim(item.value)}`}>
      <span className="financeBarTrack"><i style={{ height: `${max ? Math.max(3, Math.round(item.value / max * 100)) : 3}%` }}/></span>
      <small>{item.label}</small><b>{moneySantim(item.value)}</b>
    </div>)}</div>
  </section>;
}

function Breakdown({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  return <section className="financeBreakdown"><h3>{title}</h3>
    {items.length ? <Table headers={['Name', 'Commission']}>{items.map((item, index) => <tr key={`${item.label}-${index}`}><td>{item.label}</td><td>{moneySantim(item.value)}</td></tr>)}</Table> : <Empty text="No ledger activity for this period."/>}
  </section>;
}
