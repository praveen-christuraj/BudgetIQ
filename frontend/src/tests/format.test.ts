import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatPercent,
  initials,
  monthInputToRange,
  monthLabel,
} from '@/utils/format';

describe('money formatting', () => {
  it('formats Indian rupee amounts with two decimals', () => {
    expect(formatMoney(15000)).toBe('₹15,000.00');
    expect(formatMoney(1234.5)).toBe('₹1,234.50');
    expect(formatMoney(1234567.89)).toBe('₹12,34,567.89');
  });

  it('handles negatives and signed values', () => {
    expect(formatMoney(-1000)).toBe('-₹1,000.00');
    expect(formatMoney(500, { signed: true })).toBe('+₹500.00');
    expect(formatMoney(-500, { signed: true })).toBe('-₹500.00');
  });

  it('uses a custom currency symbol', () => {
    expect(formatMoney(100, { symbol: '$' })).toBe('$100.00');
  });

  it('compacts large values for chart axes', () => {
    expect(formatCompactMoney(1500)).toBe('₹1.5 K');
    expect(formatCompactMoney(150000)).toBe('₹1.50 L');
    expect(formatCompactMoney(25000000)).toBe('₹2.50 Cr');
  });

  it('formats percentages', () => {
    expect(formatPercent(82.456, 1)).toBe('82.5%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('date helpers', () => {
  it('formats ISO dates for display', () => {
    expect(formatDate('2026-11-09')).toBe('09 Nov 2026');
    expect(formatDate(null)).toBe('—');
  });

  it('computes the last day of a month correctly', () => {
    expect(monthInputToRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthInputToRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('labels months', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('calculates days until a date', () => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(daysUntil(iso)).toBe(1);
  });
});

describe('initials', () => {
  it('derives up to two initials', () => {
    expect(initials('Priya Sharma')).toBe('PS');
    expect(initials('Rohan')).toBe('R');
    expect(initials('')).toBe('');
  });
});
