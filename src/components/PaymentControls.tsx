'use client';

import { useState } from 'react';

export function ChapaPayButton({ orderIds }: { orderIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pay() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments/chapa/initialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.checkoutUrl !== 'string') throw new Error(data.error || 'Unable to start checkout.');
      window.location.assign(data.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start checkout.');
      setBusy(false);
    }
  }
  return <div className="paymentAction">
    <button className="ownerSmall" disabled={busy} onClick={pay}>{busy ? 'Connecting…' : 'Pay with Chapa'}</button>
    {error && <small className="errorText">{error}</small>}
  </div>;
}
