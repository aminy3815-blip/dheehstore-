'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PendingDestination = {
  id: string;
  userName: string;
  userEmail: string;
  provider: string;
  destinationType: string;
  accountHolder: string;
  accountLast4: string;
  status: string;
};

export function OwnerDestinationReview({ destinations }: { destinations: PendingDestination[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function review(destinationId: string, decision: 'VERIFIED' | 'REJECTED', verificationReference: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/owner/finance/destinations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationId, decision, verificationReference }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to review destination.');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to review destination.');
    } finally { setBusy(false); }
  }
  return <section className="dashPanel">
    <div className="eyebrow">DESTINATION REVIEW</div><h2>Seller and owner payout destinations</h2>
    {!destinations.length && <p className="muted">No pending destinations.</p>}
    {destinations.map((destination) => <DestinationReviewForm key={destination.id} destination={destination} busy={busy} onReview={review}/>)}
    {error && <div className="errorBox">{error}</div>}
  </section>;
}

function DestinationReviewForm({ destination, busy, onReview }: {
  destination: PendingDestination;
  busy: boolean;
  onReview: (id: string, decision: 'VERIFIED' | 'REJECTED', reference: string) => Promise<void>;
}) {
  const [reference, setReference] = useState('');
  return <form className="destinationReview" onSubmit={(event) => {
    event.preventDefault();
    void onReview(destination.id, 'VERIFIED', reference);
  }}>
    <div><b>{destination.provider} · {destination.destinationType} · •••• {destination.accountLast4}</b><small>{destination.userName} · {destination.userEmail} · holder: {destination.accountHolder}</small></div>
    <input value={reference} onChange={(event) => setReference(event.target.value)} minLength={4} maxLength={200} required placeholder="Evidence reference for manual account review"/>
    <button className="ownerSmall" disabled={busy}>Verify destination</button>
    <button className="ownerSmall danger" type="button" disabled={busy} onClick={() => void onReview(destination.id, 'REJECTED', reference || 'Rejected by owner after review')}>Reject</button>
  </form>;
}
