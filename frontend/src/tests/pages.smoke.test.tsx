// Smoke test: every screen renders against the real pages with a stubbed API.
// This catches the class of bug that type-checking cannot - a page that throws
// while rendering (bad hook order, missing prop, undefined access, bad import).
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedContext = {
  user: { id: 'u-1', full_name: 'Priya Sharma', email: 'priya@example.in', role: 'admin' },
  household: { id: 'h-1', name: 'Sharma Family', currency_symbol: '₹' },
  permissions: {},
};

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    context: authenticatedContext,
    householdName: 'Sharma Family',
    isAdmin: true,
    login: vi.fn(),
    setup: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactElement }) => children,
}));

// One stub object per API module used by the pages under test.
vi.mock('@/services/endpoints', () => {
  const list = () => Promise.resolve([]);
  const emptyPage = () => Promise.resolve({ items: [], total: 0, page: 1, page_size: 25, pages: 0 });
  return {
    authApi: { status: () => Promise.resolve({ initialized: true, household_name: 'Sharma Family' }), me: vi.fn(), login: vi.fn(), logout: vi.fn(), setup: vi.fn() },
    settingsApi: {
      get: () =>
        Promise.resolve({
          currency_symbol: '₹',
          date_format: 'DD-MM-YYYY',
          budget_warning_threshold: 80,
          budget_critical_threshold: 100,
          notification_lead_days: 7,
        }),
      household: () =>
        Promise.resolve({ id: 'h-1', name: 'Sharma Family', currency: 'INR', currency_symbol: '₹', created_at: '2026-01-01T00:00:00Z' }),
      system: () =>
        Promise.resolve({ app_name: 'Family Finance Manager', version: '1.0.0', environment: 'test', database: 'sqlite', python_version: '3.11', server_time: '2026-11-09T10:00:00Z' }),
      update: vi.fn(),
      updateHousehold: vi.fn(),
    },
    accountsApi: { list, get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    categoriesApi: { list, create: vi.fn(), update: vi.fn(), remove: vi.fn(), addSubcategory: vi.fn(), removeSubcategory: vi.fn() },
    transactionsApi: { list: emptyPage, get: vi.fn(), create: vi.fn(), update: vi.fn(), reverse: vi.fn(), remove: vi.fn(), duplicates: list, exportCsv: vi.fn(), uploadAttachment: vi.fn(), deleteAttachment: vi.fn() },
    transfersApi: { list: emptyPage, create: vi.fn(), reverse: vi.fn() },
    budgetsApi: { list, current: list, get: vi.fn(), create: vi.fn(), update: vi.fn(), replaceAllocations: vi.fn(), carryForward: vi.fn(), remove: vi.fn() },
    recurringApi: { list, create: vi.fn(), update: vi.fn(), remove: vi.fn(), generate: vi.fn(), generateDue: vi.fn() },
    savingsApi: { goals: list, overview: () => Promise.resolve({ total_target: 0, total_saved: 0, progress_percent: 0, goals: [] }), createGoal: vi.fn(), updateGoal: vi.fn(), removeGoal: vi.fn(), contribute: vi.fn(), removeContribution: vi.fn() },
    loansApi: { list, get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), repay: vi.fn(), removeRepayment: vi.fn() },
    membersApi: { list, get: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), resetPassword: vi.fn() },
    notificationsApi: { list, counts: () => Promise.resolve({ total: 0, unread: 0, warning: 0, critical: 0 }), markRead: vi.fn(), markAllRead: vi.fn() },
    auditApi: { list: emptyPage, actions: list },
    reportsApi: {
      monthlySummary: vi.fn(),
      annualSummary: () =>
        Promise.resolve({ year: 2026, months: [], total_income: 0, total_expenses: 0, net: 0, total_savings: 0 }),
      categoryExpenses: list,
      memberSummary: list,
      sharedVsPersonal: vi.fn(),
      budgetVsActual: list,
      savingsGrowth: list,
      accountBalances: list,
      outstandingLoans: list,
      recurringSchedule: list,
      dashboard: () =>
        Promise.resolve({
          view: 'family',
          month: '2026-11',
          totals: {
            total_income: 167200,
            total_expenses: 80298,
            remaining_cash_flow: 86902,
            total_savings_contributions: 40000,
            total_account_balance: 412500,
            budget_utilization_percent: 84.3,
            budget_planned: 95000,
            budget_actual: 80100,
            savings_goal_total: 165000,
            savings_goal_target: 450000,
            loan_outstanding: 80000,
            unread_notifications: 3,
          },
          trend: [],
          category_breakdown: [],
          member_breakdown: [],
          upcoming_payments: [],
          recent_transactions: [],
          active_budgets: [],
        }),
      exportReport: vi.fn(),
    },
  };
});

import { AccountsPage } from '@/features/accounts/AccountsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { BudgetsPage } from '@/features/budgets/BudgetsPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoansPage } from '@/features/loans/LoansPage';
import { MembersPage } from '@/features/members/MembersPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { RecurringPage } from '@/features/recurring/RecurringPage';
import { FeedbackProvider } from '@/components/common/FeedbackProvider';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SavingsPage } from '@/features/savings/SavingsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { theme } from '@/theme/theme';

function renderPage(page: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <FeedbackProvider>
          <MemoryRouter initialEntries={['/']}>{page}</MemoryRouter>
        </FeedbackProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const pages: Array<[string, ReactElement]> = [
  ['Accounts', <AccountsPage key="accounts" />],
  ['Audit', <AuditPage key="audit" />],
  ['Budgets', <BudgetsPage key="budgets" />],
  ['Categories', <CategoriesPage key="categories" />],
  ['Loans', <LoansPage key="loans" />],
  ['Members', <MembersPage key="members" />],
  ['Notifications', <NotificationsPage key="notifications" />],
  ['Recurring', <RecurringPage key="recurring" />],
  ['Reports', <ReportsPage key="reports" />],
  ['Savings', <SavingsPage key="savings" />],
  ['Settings', <SettingsPage key="settings" />],
  ['Transactions', <TransactionsPage key="transactions" kind="all" />],
  ['Income', <TransactionsPage key="income" kind="income" />],
  ['Expenses', <TransactionsPage key="expenses" kind="expense" />],
  ['Transfers', <TransfersPage key="transfers" />],
];

describe('page smoke tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each(pages)('%s page renders a heading without crashing', async (_name, page) => {
    renderPage(page);
    await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0));
  });

  it('dashboard renders both overview toggles and the monthly totals', async () => {
    renderPage(<DashboardPage />);
    expect(await screen.findByRole('button', { name: 'Family Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Finances' })).toBeInTheDocument();
    // Values come straight from the dashboard payload and are rendered in INR.
    expect(await screen.findByText('₹1,67,200.00')).toBeInTheDocument();
    expect(screen.getByText('₹80,298.00')).toBeInTheDocument();
  });
});
