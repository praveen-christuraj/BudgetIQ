import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The Reports page pulls data through TanStack Query and the API client; both are
// stubbed so this test only asserts the report catalogue and its export mapping.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/components/common/FeedbackProvider', () => ({
  useFeedback: () => ({ notify: vi.fn() }),
}));

vi.mock('@/services/endpoints', () => ({
  reportsApi: {
    monthlySummary: vi.fn(),
    annualSummary: vi.fn(),
    categoryExpenses: vi.fn(),
    memberSummary: vi.fn(),
    sharedVsPersonal: vi.fn(),
    budgetVsActual: vi.fn(),
    savingsGrowth: vi.fn(),
    accountBalances: vi.fn(),
    outstandingLoans: vi.fn(),
    recurringSchedule: vi.fn(),
    exportReport: vi.fn(),
  },
  settingsApi: { get: vi.fn() },
}));

import { REPORT_TABS, ReportsPage } from '@/features/reports/ReportsPage';

describe('reports catalogue', () => {
  it('covers the ten report types of the blueprint plus the register export', () => {
    expect(REPORT_TABS).toHaveLength(10);
    expect(REPORT_TABS.map((tab) => tab.export)).toEqual([
      'monthly-summary',
      'annual-summary',
      'category-expenses',
      'member-summary',
      'shared-vs-personal',
      'budget-vs-actual',
      'savings-growth',
      'account-balances',
      'outstanding-loans',
      'recurring-schedule',
    ]);
  });

  it('renders one tab per report type', () => {
    render(<ReportsPage />);
    expect(screen.getByRole('tab', { name: 'Monthly' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shared vs personal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recurring' })).toBeInTheDocument();
  });
});
