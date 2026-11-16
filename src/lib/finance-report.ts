export type FinanceRangeKey = '24h' | '7d' | '30d' | 'month' | 'previous-month' | 'year' | 'previous-year' | 'all' | 'custom';

export function getFinanceRange(range: string | undefined, fromValue: string | undefined, toValue: string | undefined, now = new Date()) {
  const key = (range || '30d') as FinanceRangeKey;
  const start = new Date(now);
  let from: Date | null = null;
  let to: Date | null = null;
  switch (key) {
    case '24h': from = new Date(now.getTime() - 24 * 60 * 60 * 1000); to = now; break;
    case '7d': from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); to = now; break;
    case '30d': from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); to = now; break;
    case 'month': from = new Date(start.getFullYear(), start.getMonth(), 1); to = now; break;
    case 'previous-month': from = new Date(start.getFullYear(), start.getMonth() - 1, 1); to = new Date(start.getFullYear(), start.getMonth(), 1); break;
    case 'year': from = new Date(start.getFullYear(), 0, 1); to = now; break;
    case 'previous-year': from = new Date(start.getFullYear() - 1, 0, 1); to = new Date(start.getFullYear(), 0, 1); break;
    case 'all': break;
    case 'custom': {
      if (!fromValue || !toValue) throw new Error('Custom reporting requires both a start and end date.');
      from = new Date(`${fromValue}T00:00:00.000Z`);
      to = new Date(`${toValue}T00:00:00.000Z`);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) throw new Error('Custom reporting dates are invalid.');
      to.setUTCDate(to.getUTCDate() + 1);
      break;
    }
    default: throw new Error('Unsupported financial reporting period.');
  }
  return { key, from, to };
}

export function matchesFinanceRange(createdAt: Date, range: { from: Date | null; to: Date | null }) {
  return (!range.from || createdAt >= range.from) && (!range.to || createdAt < range.to);
}
