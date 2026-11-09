import type { BudgetStatus, Severity, TransactionStatus } from '@/types';

export function budgetStatusColor(status: BudgetStatus): 'success' | 'warning' | 'error' {
  if (status === 'critical') return 'error';
  if (status === 'warning') return 'warning';
  return 'success';
}

export function severityColor(severity: Severity): 'success' | 'warning' | 'error' | 'info' {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    case 'success':
      return 'success';
    default:
      return 'info';
  }
}

export function transactionStatusColor(status: TransactionStatus): 'success' | 'default' | 'error' {
  if (status === 'posted') return 'success';
  if (status === 'reversed') return 'error';
  return 'default';
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: 'Cash',
  savings: 'Savings',
  current: 'Current account',
  credit_card: 'Credit card',
  fixed_deposit: 'Fixed deposit',
  investment: 'Investment',
  other: 'Other',
};

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other'];

export const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
