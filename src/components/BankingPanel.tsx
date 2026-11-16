'use client';

import { useEffect, useState } from 'react';

type Destination = {
  id: string;
  provider: string;
  destinationType: string;
  accountHolder: string;
  accountLast4: string;
  status: string;
};

type BankingData = {
  banks: { code: string; name: string; destinationType: 'BANK' | 'WALLET' }[];
  bankError: string | null;
  wallet: { pendingSantim: number; availableSantim: number; commissionOwedSantim: number };
  destinations: Destination[];
  payouts: {
    id: string;
    reference: string;
    amountSantim: number;
    status: string;
    createdAt: string;
    destination: { provider: string; accountLast4: string };
  }[];
  transactions: {
    id: string;
    kind: string;
    grossSaleSantim: number;
    eligibleProfitSantim: number;
    commissionSantim: number;
    sellerAmountSantim: number;
    settlementStatus: string;
    createdAt: string;
  }[];
};

const etb = (santim: number) => `${new Intl.NumberFormat('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(santim / 100)} ETB`;

export function BankingPanel({ isOwner = false }: { isOwner?: boolean }) {
  const [data, setData] = useState<BankingData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/finance/destinations');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load banking information.');
    setData(result);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load banking information.'));
  }, []);

  async function addDestination(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const form = event.currentTarget;
    const values = new FormData(form);
    const bankCode = String(values.get('bankCode') || '');
    const selectedBank = data?.banks.find((bank) => bank.code === bankCode);
    const provider = selectedBank?.name || '';
    try {
      const response = await fetch('/api/finance/destinations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destinationType: selectedBank?.destinationType,
          bankCode,
          provider,
          accountHolder: values.get('accountHolder'),
          accountNumber: values.get('accountNumber'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to add payout destination.');
      form.reset();
      setMessage('Destination saved securely and sent for owner review. It cannot receive a payout until verified.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add payout destination.');
    } finally { setBusy(false); }
  }

  async function requestPayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const payoutForm = event.currentTarget;
    const form = new FormData(payoutForm);
    try {
      const response = await fetch('/api/finance/payouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destinationId: form.get('destinationId'),
          amountEtb: Number(form.get('amountEtb')),
          confirmed: form.get('confirmed') === 'on',
          idempotencyKey: crypto.randomUUID(),
          ...(isOwner ? { currentPassword: form.get('currentPassword') } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.error || 'Unable to request payout.'}${result.reserved ? ` Reference ${result.reference} is reserved; reconcile status before retrying.` : ''}`);
      setMessage(result.message || `Payout status: ${result.status}.`);
      payoutForm.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to request payout.');
    } finally { setBusy(false); }
  }

  async function reconcile(payoutId: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/finance/payouts/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payoutId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to verify payout.');
      setMessage(`Provider-verified payout status: ${result.status}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to verify payout.');
    } finally { setBusy(false); }
  }

  async function disableDestination(destinationId: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/finance/destinations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to disable destination.');
      setMessage('Destination disabled. Add a replacement to update your banking details.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disable destination.');
    } finally { setBusy(false); }
  }

  if (!data) return <section className="dashPanel"><h2>Banking & Payments</h2>{error ? <div className="errorBox">{error}</div> : <p className="muted">Loading secure banking details…</p>}</section>;

  const verifiedDestinations = data.destinations.filter((destination) => destination.status === 'VERIFIED');
  return <section className="bankingLayout">
    <div className="bankingBalances">
      <article><small>AVAILABLE BALANCE</small><strong>{etb(data.wallet.availableSantim)}</strong></article>
      <article><small>PENDING SETTLEMENTS</small><strong>{etb(data.wallet.pendingSantim)}</strong></article>
      {!isOwner && data.wallet.commissionOwedSantim > 0 && <article><small>COD COMMISSION DUE</small><strong>{etb(data.wallet.commissionOwedSantim)}</strong></article>}
    </div>
    <section className="dashPanel">
      <div className="eyebrow">{isOwner ? 'WITHDRAW MY EARNINGS' : 'BANKING & PAYMENTS'}</div>
      <h2>{isOwner ? 'Owner commission withdrawal' : 'Connect a bank or mobile wallet'}</h2>
      {data.bankError && <div className="infoBox">{data.bankError}</div>}
      {!data.bankError && <form className="stackForm" onSubmit={addDestination}>
        <label>Supported bank or mobile wallet<select name="bankCode" required defaultValue=""><option value="" disabled>Select a supported provider</option>{data.banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.destinationType === 'WALLET' ? 'Mobile wallet' : 'Bank'} · {bank.name}</option>)}</select></label>
        <div className="formSplit">
          <label>Account holder name<input name="accountHolder" required minLength={2} maxLength={150} autoComplete="name"/></label>
          <label>Account or wallet number<input name="accountNumber" required minLength={4} maxLength={40} autoComplete="off"/></label>
        </div>
        <p className="muted bankingPrivacy">Bank details are encrypted at rest. Never enter a PIN or OTP. New destinations require review; provider verification is only shown when independently confirmed.</p>
        <button className="primaryBtn" disabled={busy}>Add destination</button>
      </form>}
      {data.destinations.length > 0 && <div className="bankDestinationList"><h3>Your destinations</h3>{data.destinations.map((destination) => <article key={destination.id}>
        <div><b>{destination.provider}</b><small>{destination.destinationType} · {destination.accountHolder} · •••• {destination.accountLast4}</small></div>
        <div><span className={`ownerBadge ${destination.status.toLowerCase()}`}>{destination.status}</span>{destination.status !== 'DISABLED' && <button className="ownerSmall danger" disabled={busy} onClick={() => disableDestination(destination.id)}>Disable</button>}</div>
      </article>)}</div>}
    </section>
    <section className="dashPanel">
      <div className="eyebrow">SECURE SETTLEMENT</div><h2>{isOwner ? 'Withdraw my earnings' : 'Request a withdrawal'}</h2>
      {verifiedDestinations.length ? <form className="stackForm" onSubmit={requestPayout}>
        <label>Verified destination<select name="destinationId" required>{verifiedDestinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.provider} · •••• {destination.accountLast4}</option>)}</select></label>
        <label>Amount (ETB)<input name="amountEtb" type="number" min="0.01" step="0.01" max={data.wallet.availableSantim / 100} required/></label>
        {isOwner && <label>Confirm owner password<input name="currentPassword" type="password" autoComplete="current-password" required/></label>}
        <label className="confirmCheck"><input name="confirmed" type="checkbox" required/> I confirm this withdrawal and understand it remains pending until Chapa verifies the transfer.</label>
        <button className="primaryBtn" disabled={busy}>Request payout</button>
      </form> : <p className="muted">Add a destination and wait for owner verification before requesting a withdrawal.</p>}
      {data.payouts.length > 0 && <div className="bankDestinationList"><h3>Withdrawal history</h3>{data.payouts.map((payout) => <article key={payout.id}>
        <div><b>{etb(payout.amountSantim)} · {payout.destination.provider} •••• {payout.destination.accountLast4}</b><small>{payout.reference} · {new Date(payout.createdAt).toLocaleString('en-ET')}</small></div>
        <div><span className={`ownerBadge ${payout.status.toLowerCase()}`}>{payout.status}</span>{['PROCESSING', 'PENDING'].includes(payout.status) && <button className="ownerSmall" disabled={busy} onClick={() => reconcile(payout.id)}>Verify status</button>}{payout.status === 'SUCCEEDED' && <a className="ownerSmall" href={`/api/finance/payouts/${payout.id}/receipt`}>Download receipt</a>}</div>
      </article>)}</div>}
    </section>
    <section className="dashPanel">
      <div className="eyebrow">LEDGER ACTIVITY</div><h2>Payment history</h2>
      {data.transactions.length ? <div className="bankDestinationList">{data.transactions.map((transaction) => <article key={transaction.id}>
        <div><b>{transaction.kind.replaceAll('_', ' ')}</b><small>{new Date(transaction.createdAt).toLocaleString('en-ET')} · {transaction.settlementStatus}</small></div>
        <div><b>{isOwner ? etb(transaction.commissionSantim) : etb(transaction.sellerAmountSantim)}</b><small>{isOwner ? 'Commission' : 'Seller amount'}</small></div>
      </article>)}</div> : <p className="muted">Verified sales and settlements will appear here.</p>}
    </section>
    {message && <div className="successBox">{message}</div>}
    {error && <div className="errorBox">{error}</div>}
  </section>;
}
