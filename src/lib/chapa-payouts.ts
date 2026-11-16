import { db } from './db';
import { chapaAmountSantim, chapaRequest } from './chapa';
import { completePayout } from './finance-ledger';

export async function verifyAndSettleChapaPayout(reference: string) {
  const payout = await db.payoutRequest.findUnique({ where: { reference } });
  if (!payout) throw new Error('Payout reference was not found.');
  if (payout.status === 'SUCCEEDED' || payout.status === 'FAILED') return payout.status;
  const response = await chapaRequest(`transfers/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  const details = response.data ?? {};
  const verifiedStatus = String(details.status ?? '').toUpperCase();
  if (details.amount === undefined || chapaAmountSantim(details.amount) !== payout.amountSantim) {
    throw new Error('Chapa payout amount does not match the reserved withdrawal amount.');
  }
  if (String(details.currency ?? '').toUpperCase() !== 'ETB') {
    throw new Error('Chapa payout currency is not ETB.');
  }
  const providerReference = typeof details.reference === 'string' ? details.reference : reference;
  if (verifiedStatus === 'SUCCESS') {
    await completePayout(payout.id, 'SUCCEEDED', providerReference);
    return 'SUCCEEDED';
  }
  if (['FAILED', 'REVERTED', 'CANCELLED'].includes(verifiedStatus)) {
    await completePayout(payout.id, 'FAILED', providerReference, `Chapa transfer status: ${verifiedStatus}`);
    return 'FAILED';
  }
  return 'PROCESSING';
}
