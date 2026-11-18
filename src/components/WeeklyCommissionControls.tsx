'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const etb = (santim: number) => (santim / 100).toFixed(2);

function etbToSantim(value: string) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter an ETB amount with up to two decimals.');
  const amount = BigInt(match[1]) * BigInt(100) + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (amount <= BigInt(0) || amount > BigInt(2147483647)) throw new Error('Enter a valid positive amount.');
  return Number(amount);
}

export function CommissionPaymentReview({ submission }: { submission: {
  id: string; amountSantim: number; confirmedSantim: number; reference: string; method: string;
  destinationProvider: string; destinationLast4: string; status: string; createdAt: string; shopName: string;
  sellerName: string; rejectionReason: string | null;
} }) {
  const [amount, setAmount] = useState(etb(submission.amountSantim));
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/owner/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to review submission.');
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to review submission.');
    } finally {
      setBusy(false);
    }
  }

  return <article className="commissionReview">
    <div><b>{submission.shopName}</b><small>{submission.sellerName} · {submission.method} to {submission.destinationProvider} ending {submission.destinationLast4}</small></div>
    <small>Submitted {new Date(submission.createdAt).toLocaleString('en-ET')} · Reference: <b>{submission.reference}</b></small>
    <small>Submitted amount {etb(submission.amountSantim)} ETB · Status {submission.status}</small>
    <a className="ownerSmall" href={`/api/owner/commission/submissions/${submission.id}/receipt`} target="_blank" rel="noreferrer">View private receipt</a>
    {submission.status === 'PENDING' || submission.status === 'AWAITING_VERIFICATION' ? <>
      <form className="inlineVerify" onSubmit={(event) => {
        event.preventDefault();
        try {
          void action({ action: 'commission-payment-confirm', id: submission.id, confirmedSantim: etbToSantim(amount) }, 'Payment confirmation recorded.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Enter a valid amount.');
        }
      }}>
        <label>Amount actually received (ETB)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required/></label>
        <button className="ownerSmall" disabled={busy}>{busy ? 'Saving…' : 'Confirm received amount'}</button>
      </form>
      <form className="inlineVerify" onSubmit={(event) => {
        event.preventDefault();
        void action({ action: 'commission-payment-reject', id: submission.id, reason }, 'Payment submission rejected.');
      }}>
        <label>Rejection reason<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={4} maxLength={500} required/></label>
        <button className="ownerSmall danger" disabled={busy}>Reject</button>
      </form>
    </> : submission.rejectionReason && <small>{submission.rejectionReason}</small>}
    {message && <small>{message}</small>}
  </article>;
}

export function CommissionRefundForm({ sale }: { sale: {
  id: string; orderId: string; orderNumber: string; orderItemId: string; productName: string;
  shopName: string; saleSantim: number; creditedRefundSantim: number;
} }) {
  const [refundAmount, setRefundAmount] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const remainingSantim = sale.saleSantim - sale.creditedRefundSantim;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const refundSantim = etbToSantim(refundAmount);
      if (refundSantim > remainingSantim) throw new Error('Refund exceeds the remaining eligible product sale amount.');
      const response = await fetch('/api/owner/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'commission-refund', orderId: sale.orderId, orderItemId: sale.orderItemId, refundSantim, reference }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to record refund.');
      setMessage('Verified refund recorded; the commission credit was applied to the oldest outstanding balance.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record refund.');
    } finally {
      setBusy(false);
    }
  }

  return <article className="commissionReview">
    <b>{sale.shopName} · {sale.productName}</b>
    <small>Order {sale.orderNumber} · eligible sale {etb(sale.saleSantim)} ETB · refunds already recorded {etb(sale.creditedRefundSantim)} ETB</small>
    {remainingSantim > 0 ? <form className="inlineVerify" onSubmit={submit}>
      <label>Already verified refund (ETB)<input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} max={(remainingSantim / 100).toFixed(2)} inputMode="decimal" required/></label>
      <label>Refund verification reference<input value={reference} onChange={(event) => setReference(event.target.value)} minLength={4} maxLength={100} required/></label>
      <button className="ownerSmall" disabled={busy}>{busy ? 'Recording…' : 'Record verified refund'}</button>
    </form> : <small>No refundable eligible sale amount remains.</small>}
    <small className="ownerNote">Only record a refund already verified outside this system. This action does not initiate a customer refund.</small>
    {message && <small>{message}</small>}
  </article>;
}

export function OwnerCommissionDestinationForm({ destination }: { destination?: {
  id: string; provider: string; accountHolder: string; accountNumber: string; isDefault: boolean;
} }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/owner/commission-destination', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: destination?.id,
          provider: formData.get('provider'),
          accountHolder: formData.get('accountHolder'),
          accountNumber: formData.get('accountNumber'),
          isDefault: formData.get('isDefault') === 'on',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save destination.');
      setMessage('Owner payment destination saved securely.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save destination.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="ownerForm settingsForm" onSubmit={submit}>
    <label>Destination type<select name="provider" defaultValue={destination?.provider || 'TELEBIRR'}>
      <option value="TELEBIRR">Telebirr</option><option value="EBIRR">E-Birr</option><option value="BANK_TRANSFER">Ethiopian bank account</option>
    </select></label>
    <label>Account holder<input name="accountHolder" defaultValue={destination?.accountHolder || ''} minLength={2} maxLength={100} required/></label>
    <label>Account number<input name="accountNumber" defaultValue={destination?.accountNumber || ''} minLength={4} maxLength={40} required autoComplete="off"/></label>
    <label><span>Make default payment destination</span><input name="isDefault" type="checkbox" defaultChecked={destination?.isDefault || false}/></label>
    <button className="goldBtn" disabled={busy}>{busy ? 'Saving…' : destination ? 'Update destination' : 'Add destination'}</button>
    {message && <small>{message}</small>}
  </form>;
}
