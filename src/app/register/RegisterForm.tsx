'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterForm({ initialRole = 'CUSTOMER' }: { initialRole?: string }) {
  const [role, setRole] = useState(initialRole === 'PRODUCER' ? 'PRODUCER' : 'CUSTOMER');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr('');

    try {
      const payload = Object.fromEntries(new FormData(e.currentTarget));
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          email: String(payload.email || '').trim().toLowerCase(),
          role,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErr(typeof data.error === 'string' ? data.error : 'Unable to create your account. Please try again.');
        return;
      }

      router.push(role === 'PRODUCER' ? '/seller' : '/');
      router.refresh();
    } catch {
      setErr('Unable to reach DHEEHSTORE. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="authPage registerPage"><div className="authCard"><div className="eyebrow">JOIN THE MARKETPLACE</div><h1>Make yourself at home.</h1><p>Shop local, or bring your own shop online.</p><div className="roleToggle"><button className={role === 'CUSTOMER' ? 'selected' : ''} onClick={() => setRole('CUSTOMER')} type="button">I’m here to shop</button><button className={role === 'PRODUCER' ? 'selected' : ''} onClick={() => setRole('PRODUCER')} type="button">I’m here to sell</button></div><form onSubmit={submit} className="stackForm"><label>Full name<input required name="name" minLength={2}/></label><div className="formSplit"><label>Email<input required type="email" name="email" autoComplete="email"/></label><label>Phone number<input name="phone" autoComplete="tel"/></label></div><label>Password <small>(8 characters minimum)</small><input required type="password" name="password" minLength={8} autoComplete="new-password"/></label>{role === 'PRODUCER' && <><div className="formSplit"><label>Shop name<input required name="shopName" minLength={2}/></label><label>City<select required name="city"><option value="">Choose city</option>{['Addis Ababa', 'Harar', 'Dire Dawa', 'Jijiga'].map(city => <option key={city}>{city}</option>)}</select></label></div><label>Tell us about your shop<textarea name="description" rows={3} placeholder="What do you make or sell?"/></label><div className="infoBox">Your shop starts as <b>pending review</b>. We’ll let you know when you can start listing.</div></>}{err && <div className="errorBox" role="alert">{err}</div>}<button className="primaryBtn wide" disabled={busy}>{busy ? 'Creating account…' : `Create ${role === 'PRODUCER' ? 'producer' : 'customer'} account →`}</button></form><div className="formFoot">Already have an account? <a href="/login">Sign in</a></div></div><div className="authSide"><span>✳</span><blockquote>A good marketplace should feel like a good neighbourhood.</blockquote><small>ROOTED HERE. OPEN TO EVERYWHERE.</small></div></main>;
}
