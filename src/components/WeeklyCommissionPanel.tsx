'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Destination = { id: string; provider: string; accountHolder: string; accountNumber: string; isDefault: boolean };
type Statement = {
  id: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  salesSantim: number;
  commissionSantim: number;
  carriedSantim: number;
  totalDueSantim: number;
  paidSantim: number;
  creditSantim: number;
  outstandingSantim: number;
  status: string;
};
type Submission = {
  id: string;
  method: string;
  destinationLast4: string;
  amountSantim: number;
  confirmedSantim: number;
  reference: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
};

const etb = (santim: number) => new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(santim / 100);
const period = (value: string | Date) => new Date(value).toLocaleDateString('en-ET', { dateStyle: 'medium', timeZone: 'Africa/Addis_Ababa' });
const providerName: Record<string, string> = { TELEBIRR: 'Telebirr', EBIRR: 'E-Birr', BANK_TRANSFER: 'Ethiopian bank' };

export function WeeklyCommissionPanel({
  currentSalesSantim,
  currentCommissionSantim,
  previousOutstandingSantim,
  totalOutstandingSantim,
  paymentDeadline,
  statements,
  submissions,
  destinations,
}: {
  currentSalesSantim: number;
  currentCommissionSantim: number;
  previousOutstandingSantim: number;
  totalOutstandingSantim: number;
  paymentDeadline: string;
  statements: Statement[];
  submissions: Submission[];
  destinations: Destination[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    const form = event.currentTarget;
    const file = (new FormData(form).get('receipt')) as File | null;
    if (!file || file.size === 0 || file.size > 3 * 1024 * 1024) {
      setError('Choose a payment receipt no larger than 3 MB.');
      setBusy(false);
      return;
    }
    const body = new FormData(form);
    body.set('idempotencyKey', crypto.randomUUID());
    try {
      const response = await fetch('/api/seller/commission/payments', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit payment.');
      setMessage(data.alreadySubmitted ? 'This payment was already submitted.' : 'Payment submitted. It remains unpaid until the owner verifies receipt.');
      form.reset();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit payment.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="dashPanel weeklyCommission">
    <div className="sectionIntro"><div><div className="eyebrow">WEEKLY COMMISSION · ETB</div><h2>Commission and payment status</h2></div></div>
    <div className="statsGrid">
      <div><small>CURRENT WEEK ELIGIBLE SALES</small><b>{etb(currentSalesSantim)}</b></div>
      <div><small>CURRENT WEEK COMMISSION · 3%</small><b>{etb(currentCommissionSantim)}</b></div>
      <div><small>PREVIOUS UNPAID BALANCE</small><b>{etb(previousOutstandingSantim)}</b></div>
      <div><small>TOTAL OUTSTANDING</small><b>{etb(totalOutstandingSantim)}</b></div>
    </div>
    <p className="muted">Commission applies to discounted product prices after orders are both paid and delivered. Delivery charges are excluded. Your payment deadline is Monday, {period(paymentDeadline)}, 23:59:59 Africa/Addis_Ababa.</p>

    {destinations.length > 0 ? <div className="ownerCommissionDestinations">
      <h3>Pay DHEEHSTORE directly</h3>
      <p className="muted">Use one of these owner-configured destinations. Never send a PIN or OTP. A submitted receipt does not mark your balance as paid.</p>
      {destinations.map((destination) => <article key={destination.id} className="commissionDestination">
        <b>{providerName[destination.provider] || destination.provider}{destination.isDefault ? ' · Default' : ''}</b>
        <span>{destination.accountHolder}</span>
        <code>{destination.accountNumber}</code>
      </article>)}
      {totalOutstandingSantim > 0 && <form className="ownerForm settingsForm" onSubmit={submitPayment}>
        <label>Payment destination<select name="destinationId" required defaultValue={destinations.find((destination) => destination.isDefault)?.id || destinations[0].id}>
          {destinations.map((destination) => <option value={destination.id} key={destination.id}>{providerName[destination.provider] || destination.provider} · ending {destination.accountNumber.slice(-4)}</option>)}
        </select></label>
        <label>Amount paid (ETB)<input name="amount" type="number" min="0.01" max={(totalOutstandingSantim / 100).toFixed(2)} step="0.01" required/></label>
        <label>Transaction reference<input name="reference" minLength={4} maxLength={100} required/></label>
        <label>Upload receipt (PDF/JPEG/PNG/WebP, max 3 MB)<input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required/></label>
        <button className="goldBtn" disabled={busy}>{busy ? 'Submitting…' : 'Submit payment for verification'}</button>
        {message && <small>{message}</small>}{error && <small className="errorText">{error}</small>}
      </form>}
    </div> : <p className="infoBox">The owner has not configured a payment destination yet. You cannot submit a commission payment until one is available.</p>}

    <h3 className="ownerSubheading">Weekly statement history</h3>
    {statements.length ? <div className="weeklyStatementList">{statements.map((statement) => <article key={statement.id}>
      <div><b>{period(statement.periodStart)} – {period(new Date(new Date(statement.periodEnd).getTime() - 1000))}</b><span className={`statusPill ${statement.status.toLowerCase()}`}>{statement.status.replaceAll('_', ' ')}</span></div>
      <small>Eligible sales {etb(statement.salesSantim)} · Commission {etb(statement.commissionSantim)} · Previous balance {etb(statement.carriedSantim)}</small>
      <small>Payments confirmed {etb(statement.paidSantim)} · Refund credits {etb(statement.creditSantim)} · Remaining {etb(statement.outstandingSantim)}</small>
      <small>Deadline {period(statement.deadline)} at 23:59:59 Addis time</small>
      <a className="textLink" href={`/api/seller/commission/statements/${statement.id}`}>Download statement CSV ↓</a>
    </article>)}</div> : <p className="muted">No completed weekly statements yet. Eligible sales from the current week appear above.</p>}

    <h3 className="ownerSubheading">Payment history</h3>
    {submissions.length ? <div className="weeklyStatementList">{submissions.map((submission) => <article key={submission.id}>
      <div><b>{submission.reference}</b><span className={`statusPill ${submission.status.toLowerCase()}`}>{submission.status.replaceAll('_', ' ')}</span></div>
      <small>{providerName[submission.method] || submission.method} · ending {submission.destinationLast4} · submitted {etb(submission.amountSantim)} · confirmed {etb(submission.confirmedSantim)}</small>
      <small>{new Date(submission.createdAt).toLocaleString('en-ET')}</small>
      {submission.rejectionReason && <small className="errorText">{submission.rejectionReason}</small>}
    </article>)}</div> : <p className="muted">No commission payments submitted.</p>}
  </section>;
}
