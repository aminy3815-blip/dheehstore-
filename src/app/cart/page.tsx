'use client';
import { useEffect, useState } from 'react';
import { money } from '@/lib/format';
import { useRouter } from 'next/navigation';

export default function Cart() {
  const [items, setItems] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => setItems(JSON.parse(localStorage.getItem('dheeh-cart') || '[]')), []);
  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    fetch('/api/checkout/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setQuote(data); })
      .catch((e) => setError(e.message));
  }, [items]);
  function save(next: any[]) { setItems(next); localStorage.setItem('dheeh-cart', JSON.stringify(next)); dispatchEvent(new Event('storage')); }
  async function checkout(e: any) {
    e.preventDefault(); setBusy(true); setError('');
    const fd = new FormData(e.currentTarget);
    const address = { city: fd.get('city'), district: fd.get('district'), neighborhood: fd.get('neighborhood'), street: fd.get('street'), building: fd.get('building'), phone: fd.get('phone'), instructions: fd.get('instructions') };
    const paymentMethod = String(fd.get('paymentMethod'));
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })), address, paymentMethod }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error); setBusy(false); return; }
    const placed = data.orders.map((order: { orderNumber: string }) => order.orderNumber).join(',');
    localStorage.removeItem('dheeh-cart'); dispatchEvent(new Event('storage'));
    if (paymentMethod === 'CHAPA') {
      const paymentResponse = await fetch('/api/payments/chapa/initialize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds: data.orders.map((order: { id: string }) => order.id) }) });
      const payment = await paymentResponse.json();
      if (paymentResponse.ok && typeof payment.checkoutUrl === 'string') { window.location.assign(payment.checkoutUrl); return; }
      router.push(`/orders?placed=${encodeURIComponent(placed)}&payment=retry`);
      return;
    }
    router.push(`/orders?placed=${encodeURIComponent(placed)}`);
  }
  return <main className="wrap pageContent"><div className="eyebrow">YOUR BAG</div><h1>Ready when you are.</h1>{!items.length ? <div className="empty"><p>Your bag is waiting for something good.</p><a className="primaryBtn" href="/#market">Explore the marketplace →</a></div> : <div className="checkoutGrid"><section><div className="cartRows">{items.map((item, index) => <div className="cartRow" key={item.productId}><img src={item.imageUrl} alt=""/><div className="cartItem"><b>{item.name}</b><small>From {item.shopName}</small><strong>{money(item.price)}</strong></div><div className="qty"><button onClick={() => save(items.map((entry, n) => n === index ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))}>−</button>{item.quantity}<button onClick={() => save(items.map((entry, n) => n === index ? { ...entry, quantity: entry.quantity + 1 } : entry))}>＋</button></div><button className="remove" onClick={() => save(items.filter((_, n) => n !== index))}>Remove</button></div>)}</div><div className="infoBox">Your checkout is split into separate orders by seller. Delivery costs are calculated per shop.</div></section><form onSubmit={checkout} className="checkoutForm"><h2>Delivery & payment</h2><div className="formSplit"><label>City<select name="city" required>{['Addis Ababa', 'Harar', 'Dire Dawa', 'Jijiga'].map((city) => <option key={city}>{city}</option>)}</select></label><label>District / sub-city<input name="district" placeholder="e.g. Bole"/></label></div><div className="formSplit"><label>Neighborhood<input name="neighborhood"/></label><label>Phone number<input name="phone" required/></label></div><label>Street or nearby landmark<input name="street"/></label><div className="formSplit"><label>Building number<input name="building"/></label><label>Payment method<select name="paymentMethod"><option value="COD">Cash on delivery</option><option value="CHAPA">Chapa (setup required)</option><option value="TELEBIRR">Telebirr (setup required)</option><option value="BANK_TRANSFER">Bank transfer</option><option value="STRIPE">Stripe (setup required)</option></select></label></div><label>Delivery instructions<textarea name="instructions" rows={2}/></label><div className="totals"><span>Subtotal</span><b>{money(quote?.subtotal ?? 0)}</b>{quote?.sellers?.map((seller: any) => <><span key={`${seller.shopName}-label`}>{seller.shopName} delivery</span><b key={`${seller.shopName}-fee`}>{money(seller.deliveryFee)}</b></>)}<span className="totalLabel">Total</span><strong className="totalPrice">{quote ? money(quote.total) : 'Calculating…'}</strong></div>{error && <div className="errorBox">{error}</div>}<button disabled={busy || !quote} className="primaryBtn wide">{busy ? 'Placing order…' : 'Place order →'}</button><small className="muted">Gateway choices are recorded as pending until provider credentials and verification are configured.</small></form></div>}</main>;
}
