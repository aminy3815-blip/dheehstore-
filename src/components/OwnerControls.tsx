'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function OwnerAction({ payload, label, danger = false }: { payload: Record<string, any>; label: string; danger?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const router = useRouter();
  async function run() { setBusy(true); setError(''); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) setError(data.error || 'Action failed'); else router.refresh(); setBusy(false); }
  return <span className="ownerAction"><button className={danger ? 'ownerSmall danger' : 'ownerSmall'} disabled={busy} onClick={run}>{busy ? 'Saving…' : label}</button>{error && <small className="errorText">{error}</small>}</span>;
}

export function OwnerChoice({ action, id, options, current }: { action: string; id: string; options: string[]; current: string }) {
  const [busy, setBusy] = useState(false); const router = useRouter();
  async function change(e: any) { const value = e.target.value; if (!value || value === current) return; setBusy(true); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, id, status: value }) }); const data = await response.json(); if (!response.ok) alert(data.error); else router.refresh(); setBusy(false); }
  return <select aria-label={`Change status from ${current}`} disabled={busy} defaultValue="" onChange={change} className="ownerSelect"><option value="">{current.replaceAll('_', ' ')}</option>{options.filter((value) => value !== current).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>;
}

export function OwnerPaymentVerify({ id, initialReference }: { id: string; initialReference: string | null }) {
  const [reference, setReference] = useState(initialReference || ''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function verify(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'verify-bank-transfer', id, reference }) }); const data = await response.json(); setMessage(response.ok ? 'Verified' : data.error); if (response.ok) router.refresh(); setBusy(false); }
  return <form className="inlineVerify" onSubmit={verify}><input aria-label="Bank transfer reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer reference" minLength={4} required/><button className="ownerSmall" disabled={busy}>{busy ? 'Saving…' : 'Verify transfer'}</button>{message && <small>{message}</small>}</form>;
}

export function CommissionForm({ initialPercent }: { initialPercent: number }) {
  const [percent, setPercent] = useState(initialPercent); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'commission-global', basisPoints: Math.round(Number(percent) * 100) }) }); const data = await response.json(); setMessage(response.ok ? 'Saved. Collection remains inactive.' : data.error); if (response.ok) router.refresh(); setBusy(false); }
  return <form className="ownerForm" onSubmit={submit}><label>Global commission (%)<input type="number" min="0" max="25" step="0.25" value={percent} onChange={(e) => setPercent(Number(e.target.value))} required/></label><button className="goldBtn" disabled={busy}>{busy ? 'Saving…' : 'Save global rate'}</button>{message && <small>{message}</small>}</form>;
}

export function NetProfitCommissionForm({ initialPercent }: { initialPercent: number }) {
  const [percent, setPercent] = useState(initialPercent); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'commission-net-profit', basisPoints: Math.round(Number(percent) * 100) }) }); const data = await response.json(); setMessage(response.ok ? 'Net-profit commission rate saved.' : data.error); if (response.ok) router.refresh(); setBusy(false); }
  return <form className="ownerForm" onSubmit={submit}><label>Commission on eligible net profit (%)<input type="number" min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(Number(e.target.value))} required/></label><button className="goldBtn" disabled={busy}>{busy ? 'Saving…' : 'Save net-profit rate'}</button>{message && <small>{message}</small>}</form>;
}

export function CategoryCommissionForm({ categoryId, initialPercent }: { categoryId: string; initialPercent: number }) {
  const [percent, setPercent] = useState(initialPercent); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'commission-category', categoryId, basisPoints: Math.round(Number(percent) * 100) }) }); const data = await response.json(); setMessage(response.ok ? 'Saved' : data.error); if (response.ok) router.refresh(); setBusy(false); }
  return <form className="categoryRateForm" onSubmit={submit}><input aria-label="Commission percent" type="number" min="0" max="50" step="0.25" value={percent} onChange={(e) => setPercent(Number(e.target.value))} required/><span>%</span><button className="ownerSmall" disabled={busy}>{busy ? '…' : 'Save'}</button>{message && <small>{message}</small>}</form>;
}

export function MarketplaceSettingsForm({ platformName, supportEmail }: { platformName: string; supportEmail: string }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(e.currentTarget); const response = await fetch('/api/owner/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'marketplace-settings', platformName: form.get('platformName'), supportEmail: form.get('supportEmail') }) }); const data = await response.json(); setMessage(response.ok ? 'Marketplace settings saved.' : data.error); if (response.ok) router.refresh(); setBusy(false); }
  return <form className="ownerForm settingsForm" onSubmit={submit}><label>Marketplace name<input name="platformName" defaultValue={platformName} required minLength={3}/></label><label>Support email<input name="supportEmail" type="email" defaultValue={supportEmail}/></label><button className="goldBtn" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>{message && <small>{message}</small>}</form>;
}

export function PasswordChangeForm() {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: any) { e.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(e.currentTarget); const response = await fetch('/api/owner/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) }); const data = await response.json(); setMessage(response.ok ? 'Password changed successfully.' : data.error); if (response.ok) e.currentTarget.reset(); setBusy(false); }
  return <form className="ownerForm settingsForm" onSubmit={submit}><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password"/></label><label>New password <small>(at least 12 characters)</small><input name="newPassword" type="password" minLength={12} required autoComplete="new-password"/></label><button className="goldBtn" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>{message && <small>{message}</small>}</form>;
}
