// Formatting helpers. All money comes from the API already rounded to 2 dp.

export function formatMoney(value: number | null | undefined, options?: { symbol?: string; signed?: boolean }): string {
  const symbol = options?.symbol ?? '₹';
  const amount = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : options?.signed && amount > 0 ? '+' : '';
  return `${sign}${symbol}${formatted}`;
}

export function formatCompactMoney(value: number | null | undefined, symbol = '₹'): string {
  const amount = Number(value ?? 0);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}${symbol}${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}${symbol}${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)} K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function formatDate(value: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthInputToRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function daysUntil(dateISO: string): number {
  const due = new Date(`${dateISO}T00:00:00`).getTime();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((due - start) / 86400000);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
