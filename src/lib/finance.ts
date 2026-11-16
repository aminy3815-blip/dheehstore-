export const SANTIM_PER_ETB = 100;

export type SaleInput = {
  unitPriceBirr: number;
  quantity: number;
  unitCostSantim: number;
  discountSantim?: number;
  commissionBps: number;
};

export type SaleAmounts = {
  grossSaleSantim: number;
  productCostSantim: number;
  eligibleProfitSantim: number;
  commissionSantim: number;
  sellerAmountSantim: number;
};

export function calculateSaleAmounts(input: SaleInput): SaleAmounts {
  for (const [name, value] of Object.entries(input)) {
    if (name === 'discountSantim' || name === 'commissionBps') continue;
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 10000) {
    throw new RangeError('commissionBps must be an integer from 0 to 10000.');
  }
  const discountSantim = input.discountSantim ?? 0;
  if (!Number.isSafeInteger(discountSantim) || discountSantim < 0) throw new RangeError('discountSantim must be a non-negative safe integer.');
  const grossSaleSantim = input.unitPriceBirr * SANTIM_PER_ETB * input.quantity;
  if (!Number.isSafeInteger(grossSaleSantim) || discountSantim > grossSaleSantim) throw new RangeError('Discount cannot exceed the gross sale.');
  const netGrossSantim = grossSaleSantim - discountSantim;
  const productCostSantim = input.unitCostSantim * input.quantity;
  if (!Number.isSafeInteger(productCostSantim)) throw new RangeError('Product cost exceeds the supported amount.');
  const eligibleProfitSantim = Math.max(0, netGrossSantim - productCostSantim);
  const commissionSantim = Math.round(eligibleProfitSantim * input.commissionBps / 10000);
  return {
    grossSaleSantim: netGrossSantim,
    productCostSantim,
    eligibleProfitSantim,
    commissionSantim,
    sellerAmountSantim: netGrossSantim - commissionSantim,
  };
}

export type Posting = { account: string; debitSantim: number; creditSantim: number };

export function assertBalancedPostings(postings: Posting[]) {
  if (!postings.length || postings.some((posting) =>
    !posting.account ||
    !Number.isSafeInteger(posting.debitSantim) ||
    !Number.isSafeInteger(posting.creditSantim) ||
    posting.debitSantim < 0 ||
    posting.creditSantim < 0 ||
    (posting.debitSantim > 0 && posting.creditSantim > 0)
  )) throw new Error('Ledger postings must contain valid, one-sided debit or credit amounts.');
  const debits = postings.reduce((sum, posting) => sum + posting.debitSantim, 0);
  const credits = postings.reduce((sum, posting) => sum + posting.creditSantim, 0);
  if (!Number.isSafeInteger(debits) || debits !== credits) throw new Error('Ledger transaction is not balanced.');
}
