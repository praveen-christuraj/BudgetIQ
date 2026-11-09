// Behavioural test for the transaction register: the shared/personal scope badge,
// signed amounts and the "draft" status must be visible exactly as the API returns
// them, and the delete action must reverse rather than erase.
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    context: {
      user: { id: 'u-2', full_name: 'Rohan Sharma', email: 'rohan@example.in', role: 'member' },
      household: { id: 'h-1', name: 'Sharma Family', currency_symbol: '₹' },
      permissions: {},
    },
    householdName: 'Sharma Family',
    isAdmin: false,
    login: vi.fn(),
    setup: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const transactions = [
  {
    id: 't-1',
    transaction_date: '2026-11-05',
    transaction_type: 'expense',
    scope: 'personal',
    description: 'Gym membership',
    owner_name: 'Rohan Sharma',
    payment_method: 'upi',
    category_name: 'Entertainment',
    subcategory_name: null,
    account_name: 'Personal Savings',
    amount: 2500,
    status: 'posted',
    is_editable: true,
  },
  {
    id: 't-2',
    transaction_date: '2026-11-04',
    transaction_type: 'income',
    scope: 'shared',
    description: 'Priya salary',
    owner_name: null,
    payment_method: 'bank_transfer',
    category_name: 'Salary',
    subcategory_name: 'Primary salary',
    account_name: 'Main Savings Account',
    amount: 120000,
    status: 'draft',
    is_editable: true,
  },
];

vi.mock('@/services/endpoints', () => ({
  transactionsApi: {
    list: () =>
      Promise.resolve({ items: transactions, total: 2, page: 1, page_size: 25, pages: 1 }),
    duplicates: () => Promise.resolve([]),
    export: vi.fn(),
    reverse: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  },
  accountsApi: { list: () => Promise.resolve([]) },
  membersApi: { list: () => Promise.resolve([]) },
  categoriesApi: { list: () => Promise.resolve([]) },
  settingsApi: { get: () => Promise.resolve({ currency_symbol: '₹' }) },
}));

import { FeedbackProvider } from '@/components/common/FeedbackProvider';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';
import { theme } from '@/theme/theme';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <FeedbackProvider>
          <MemoryRouter>
            <TransactionsPage kind="all" />
          </MemoryRouter>
        </FeedbackProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('transactions register', () => {
  it('shows scope, signed amounts and status for each row', async () => {
    renderPage();

    const personalRow = (await screen.findByText('Gym membership')).closest('tr') as HTMLElement;
    expect(within(personalRow).getByText('Personal')).toBeInTheDocument();
    expect(within(personalRow).getByText('-₹2,500.00')).toBeInTheDocument();
    expect(within(personalRow).getByText('Posted')).toBeInTheDocument();

    const sharedRow = screen.getByText('Priya salary').closest('tr') as HTMLElement;
    expect(within(sharedRow).getByText('Shared')).toBeInTheDocument();
    expect(within(sharedRow).getByText('+₹1,20,000.00')).toBeInTheDocument();
    expect(within(sharedRow).getByText('Draft')).toBeInTheDocument();
    // Shared rows have no owner, so the household label is shown instead.
    expect(within(sharedRow).getByText(/Household/)).toBeInTheDocument();
  });

  it('offers reversal instead of a hard delete', async () => {
    renderPage();
    const row = (await screen.findByText('Priya salary')).closest('tr') as HTMLElement;
    await waitFor(() => expect(within(row).getByLabelText('Reverse')).toBeInTheDocument());
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
  });
});
