export type FinanceRangeKey = '24h' | '7d' | '30d' | 'month' | 'previous-month' | 'year' | 'previous-year' | 'all' | 'custom';

const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;

export function getAddisDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = number('year');
  const month = number('month');
  const day = number('day');
  if (!year || !month || !day) throw new Error('Unable to determine the Addis Ababa business date.');
  return { year, month, day };
}

export function getAddisDateKey(value: Date) {
  const { year, month, day } = getAddisDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getAddisDateStart(value: Date) {
  const { year, month, day } = getAddisDateParts(value);
  return new Date(Date.UTC(year, month - 1, day) - ADDIS_OFFSET_MS);
}

export function addAddisDays(value: Date, days: number) {
  return new Date(getAddisDateStart(value).getTime() + days * 24 * 60 * 60 * 1000);
}

export function getAddisMonthStart(value: Date, monthOffset = 0) {
  const { year, month } = getAddisDateParts(value);
  return new Date(Date.UTC(year, month - 1 + monthOffset, 1) - ADDIS_OFFSET_MS);
}

export function getAddisYearStart(value: Date, yearOffset = 0) {
  const { year } = getAddisDateParts(value);
  return new Date(Date.UTC(year + yearOffset, 0, 1) - ADDIS_OFFSET_MS);
}

export function getFinanceRange(range: string | undefined, fromValue: string | undefined, toValue: string | undefined, now = new Date()) {
  const key = (range || '30d') as FinanceRangeKey;
  let from: Date | null = null;
  let to: Date | null = null;
  switch (key) {
    case '24h': from = new Date(now.getTime() - 24 * 60 * 60 * 1000); to = now; break;
    case '7d': from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); to = now; break;
    case '30d': from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); to = now; break;
    case 'month': from = getAddisMonthStart(now); to = now; break;
    case 'previous-month': from = getAddisMonthStart(now, -1); to = getAddisMonthStart(now); break;
    case 'year': from = getAddisYearStart(now); to = now; break;
    case 'previous-year': from = getAddisYearStart(now, -1); to = getAddisYearStart(now); break;
    case 'all': break;
    case 'custom': {
      if (!fromValue || !toValue) throw new Error('Custom reporting requires both a start and end date.');
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(fromValue) || !datePattern.test(toValue)) throw new Error('Custom reporting dates are invalid.');
      if (fromValue > toValue) throw new Error('Custom reporting dates are invalid.');
      const [fromYear, fromMonth, fromDay] = fromValue.split('-').map(Number);
      const [toYear, toMonth, toDay] = toValue.split('-').map(Number);
      from = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay) - ADDIS_OFFSET_MS);
      to = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1) - ADDIS_OFFSET_MS);
      if (getAddisDateKey(from) !== fromValue || getAddisDateKey(new Date(to.getTime() - 1)) !== toValue || to < from) {
        throw new Error('Custom reporting dates are invalid.');
      }
      break;
    }
    default: throw new Error('Unsupported financial reporting period.');
  }
  return { key, from, to };
}

export function matchesFinanceRange(createdAt: Date, range: { from: Date | null; to: Date | null }) {
  return (!range.from || createdAt >= range.from) && (!range.to || createdAt < range.to);
}
