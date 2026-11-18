'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr('');

    try {
      const form = new FormData(e.currentTarget);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') || '').trim().toLowerCase(),
          password: String(form.get('password') || ''),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErr(typeof data.error === 'string' ? data.error : 'Unable to sign in. Please check your details and try again.');
        return;
      }
      router.push(data.role === 'OWNER' ? '/owner' : data.role === 'ADMIN' ? '/admin' : data.role === 'PRODUCER' ? '/seller' : '/orders');
      router.refresh();
    } catch {
      setErr('Unable to reach DHEEHSTORE. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return <main className="authPage"><div className="authCard"><div className="eyebrow">WELCOME BACK</div><h1>Good to see you.</h1><p>Sign in to pick up where you left off.</p><form onSubmit={submit} className="stackForm"><label>Email address<input required type="email" name="email" autoComplete="email"/></label><label>Password<input required type="password" name="password" autoComplete="current-password"/></label>{err && <div className="errorBox">{err}</div>}<button className="primaryBtn wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button></form><div className="formFoot">New around here? <a href="/register">Create an account</a></div></div><div className="authSide"><span>✳</span><blockquote>“The best finds are the ones you discover close to home.”</blockquote><small>THE DHEEHSTORE WAY</small></div></main>;
}
