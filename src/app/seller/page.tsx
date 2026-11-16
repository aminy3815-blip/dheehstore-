import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import { redirect } from 'next/navigation';
import { ProductForm, OrderStatusButton, ProductManage } from '@/components/SellerControls';

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
