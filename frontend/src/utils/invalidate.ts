import type { QueryClient } from '@tanstack/react-query';

const FINANCIAL_KEYS = [
  'dashboard',
  'accounts',
  'transactions',
  'transfers',
  'budgets',
  'recurring',
  'savings',
  'loans',
  'reports',
  'notifications',
  'audit',
  'members',
  'settings',
  'categories',
];

/** Refresh every derived financial view after a mutation. */
export async function invalidateFinancialData(queryClient: QueryClient): Promise<void> {
  await Promise.all(FINANCIAL_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}
