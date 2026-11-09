// Typed API surface used by TanStack Query hooks and pages.
import { downloadFile, request } from './api';
import type {
  Account,
  AccountBalanceRow,
  AnnualSummary,
  AuditEntry,
  AuthContextPayload,
  Budget,
  BudgetSummary,
  BudgetVsActualRow,
  Category,
  CategoryReportRow,
  Dashboard,
  Household,
  HouseholdSettings,
  Loan,
  LoanReportRow,
  Member,
  MemberReportRow,
  MonthlySummary,
  Notification,
  NotificationCounts,
  Page,
  RecurringRule,
  RecurringScheduleRow,
  SavingsGoal,
  SavingsGrowthRow,
  ScopeReport,
  SetupStatus,
  SystemInfo,
  TokenResponse,
  Transaction,
  TransactionCreateResult,
  TransactionFilters,
  Transfer,
} from '@/types';

type Id = string;

// --------------------------------------------------------------------------
// Authentication
// --------------------------------------------------------------------------
export const authApi = {
  status: () => request<SetupStatus>('/auth/status'),
  setup: (payload: {
    household_name: string;
    full_name: string;
    email: string;
    password: string;
  }) => request<TokenResponse>('/auth/setup', { method: 'POST', body: payload, auth: false }),
  login: (payload: { email: string; password: string }) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request<AuthContextPayload>('/auth/me'),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<{ message: string }>('/auth/change-password', { method: 'POST', body: payload }),
};

// --------------------------------------------------------------------------
// Members
// --------------------------------------------------------------------------
export const membersApi = {
  list: () => request<Member[]>('/members'),
  get: (id: Id) => request<Member>(`/members/${id}`),
  create: (payload: {
    full_name: string;
    email: string;
    password: string;
    role: string;
    relationship_label?: string | null;
    display_color?: string;
  }) => request<Member>('/members', { method: 'POST', body: payload }),
  update: (id: Id, payload: Partial<Member> & { password?: string }) =>
    request<Member>(`/members/${id}`, { method: 'PATCH', body: payload }),
  deactivate: (id: Id) => request<{ message: string }>(`/members/${id}`, { method: 'DELETE' }),
  resetPassword: (id: Id, new_password: string) =>
    request<{ message: string }>(`/members/${id}/reset-password`, {
      method: 'POST',
      body: { new_password },
    }),
};

// --------------------------------------------------------------------------
// Accounts
// --------------------------------------------------------------------------
export const accountsApi = {
  list: (includeInactive = false) =>
    request<Account[]>('/accounts', { params: { include_inactive: includeInactive } }),
  create: (payload: Record<string, unknown>) => request<Account>('/accounts', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<Account>(`/accounts/${id}`, { method: 'PATCH', body: payload }),
  remove: (id: Id) => request<{ message: string }>(`/accounts/${id}`, { method: 'DELETE' }),
};

// --------------------------------------------------------------------------
// Categories
// --------------------------------------------------------------------------
export const categoriesApi = {
  list: (kind?: 'income' | 'expense', includeInactive = false) =>
    request<Category[]>('/categories', { params: { kind, include_inactive: includeInactive } }),
  create: (payload: Record<string, unknown>) =>
    request<Category>('/categories', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: payload }),
  remove: (id: Id) => request<{ message: string }>(`/categories/${id}`, { method: 'DELETE' }),
  addSubcategory: (id: Id, name: string) =>
    request<Category>(`/categories/${id}/subcategories`, { method: 'POST', body: { name } }),
  removeSubcategory: (id: Id, subcategoryId: Id) =>
    request<{ message: string }>(`/categories/${id}/subcategories/${subcategoryId}`, {
      method: 'DELETE',
    }),
};

// --------------------------------------------------------------------------
// Transactions
// --------------------------------------------------------------------------
export const transactionsApi = {
  list: (filters: TransactionFilters) =>
    request<Page<Transaction>>('/transactions', { params: { ...filters } }),
  get: (id: Id) => request<Transaction>(`/transactions/${id}`),
  create: (payload: Record<string, unknown>) =>
    request<TransactionCreateResult>('/transactions', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: payload }),
  reverse: (id: Id, reason: string) =>
    request<Transaction>(`/transactions/${id}/reverse`, { method: 'POST', body: { reason } }),
  remove: (id: Id, reason?: string) =>
    request<{ message: string }>(`/transactions/${id}`, {
      method: 'DELETE',
      params: { reason },
    }),
  uploadAttachment: (id: Id, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ id: string; filename: string }>(`/transactions/${id}/attachments`, {
      method: 'POST',
      formData,
    });
  },
  deleteAttachment: (id: Id, attachmentId: Id) =>
    request<{ message: string }>(`/transactions/${id}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
  downloadAttachment: (id: Id, attachmentId: Id, filename: string) =>
    downloadFile(`/transactions/${id}/attachments/${attachmentId}`, {}, filename),
  export: (filters: TransactionFilters) =>
    downloadFile(
      '/transactions/export',
      filters as unknown as Record<string, string | number | boolean | null | undefined>,
      `transactions_${new Date().toISOString().slice(0, 10)}.xlsx`,
    ),
};

// --------------------------------------------------------------------------
// Transfers
// --------------------------------------------------------------------------
export const transfersApi = {
  list: (filters: { date_from?: string; date_to?: string; account_id?: string } = {}) =>
    request<Transfer[]>('/transfers', { params: filters }),
  create: (payload: {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    transfer_date: string;
    description?: string;
  }) => request<Transfer>('/transfers', { method: 'POST', body: payload }),
  reverse: (id: Id, reason?: string) =>
    request<{ message: string }>(`/transfers/${id}`, { method: 'DELETE', params: { reason } }),
};

// --------------------------------------------------------------------------
// Budgets
// --------------------------------------------------------------------------
export const budgetsApi = {
  list: (params: { period_type?: string; status?: string; owner_user_id?: string } = {}) =>
    request<Budget[]>('/budgets', { params }),
  current: (on_date?: string) => request<BudgetSummary[]>('/budgets/current', { params: { on_date } }),
  get: (id: Id) => request<BudgetSummary>(`/budgets/${id}`),
  create: (payload: Record<string, unknown>) =>
    request<BudgetSummary>('/budgets', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<BudgetSummary>(`/budgets/${id}`, { method: 'PUT', body: payload }),
  replaceAllocations: (id: Id, allocations: { category_id: string; planned_amount: number }[]) =>
    request<BudgetSummary>(`/budgets/${id}/allocations`, { method: 'PUT', body: allocations }),
  carryForward: (id: Id) => request<BudgetSummary>(`/budgets/${id}/carry-forward`, { method: 'POST' }),
  archive: (id: Id) => request<{ message: string }>(`/budgets/${id}`, { method: 'DELETE' }),
};

// --------------------------------------------------------------------------
// Recurring
// --------------------------------------------------------------------------
export const recurringApi = {
  list: (activeOnly = false) => request<RecurringRule[]>('/recurring', { params: { active_only: activeOnly } }),
  create: (payload: Record<string, unknown>) =>
    request<RecurringRule>('/recurring', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<RecurringRule>(`/recurring/${id}`, { method: 'PATCH', body: payload }),
  deactivate: (id: Id) => request<{ message: string }>(`/recurring/${id}`, { method: 'DELETE' }),
  generate: (id: Id) =>
    request<{ created: number; message: string }>(`/recurring/${id}/generate`, { method: 'POST' }),
  generateDue: () =>
    request<{ created: number; message: string }>('/recurring/generate-due', { method: 'POST' }),
};

// --------------------------------------------------------------------------
// Savings
// --------------------------------------------------------------------------
export const savingsApi = {
  goals: () => request<SavingsGoal[]>('/savings/goals'),
  overview: () =>
    request<{
      goal_count: number;
      active_goals: number;
      total_saved: number;
      total_target: number;
      progress_percent: number;
      achieved_goals: number;
    }>('/savings/overview'),
  createGoal: (payload: Record<string, unknown>) =>
    request<SavingsGoal>('/savings/goals', { method: 'POST', body: payload }),
  updateGoal: (id: Id, payload: Record<string, unknown>) =>
    request<SavingsGoal>(`/savings/goals/${id}`, { method: 'PATCH', body: payload }),
  archiveGoal: (id: Id) => request<{ message: string }>(`/savings/goals/${id}`, { method: 'DELETE' }),
  contribute: (id: Id, payload: Record<string, unknown>) =>
    request<SavingsGoal>(`/savings/goals/${id}/contributions`, { method: 'POST', body: payload }),
  removeContribution: (goalId: Id, contributionId: Id) =>
    request<SavingsGoal>(`/savings/goals/${goalId}/contributions/${contributionId}`, {
      method: 'DELETE',
    }),
};

// --------------------------------------------------------------------------
// Loans
// --------------------------------------------------------------------------
export const loansApi = {
  list: (params: { direction?: string; status?: string } = {}) =>
    request<Loan[]>('/loans', { params }),
  create: (payload: Record<string, unknown>) => request<Loan>('/loans', { method: 'POST', body: payload }),
  update: (id: Id, payload: Record<string, unknown>) =>
    request<Loan>(`/loans/${id}`, { method: 'PATCH', body: payload }),
  close: (id: Id) => request<{ message: string }>(`/loans/${id}`, { method: 'DELETE' }),
  addRepayment: (id: Id, payload: Record<string, unknown>) =>
    request<Loan>(`/loans/${id}/repayments`, { method: 'POST', body: payload }),
  removeRepayment: (id: Id, repaymentId: Id) =>
    request<Loan>(`/loans/${id}/repayments/${repaymentId}`, { method: 'DELETE' }),
};

// --------------------------------------------------------------------------
// Reports & dashboard
// --------------------------------------------------------------------------
export const reportsApi = {
  dashboard: (month: string, view: 'family' | 'personal') =>
    request<Dashboard>('/reports/dashboard', { params: { month, view } }),
  monthlySummary: (year: number, month: number, member_id?: string) =>
    request<MonthlySummary>('/reports/monthly-summary', { params: { year, month, member_id } }),
  annualSummary: (year: number, member_id?: string) =>
    request<AnnualSummary>('/reports/annual-summary', { params: { year, member_id } }),
  categoryExpenses: (params: { date_from?: string; date_to?: string; member_id?: string; kind?: string }) =>
    request<CategoryReportRow[]>('/reports/category-expenses', { params }),
  memberSummary: (params: { date_from?: string; date_to?: string }) =>
    request<MemberReportRow[]>('/reports/member-summary', { params }),
  sharedVsPersonal: (params: { date_from?: string; date_to?: string }) =>
    request<ScopeReport>('/reports/shared-vs-personal', { params }),
  budgetVsActual: (on_date?: string) =>
    request<BudgetVsActualRow[]>('/reports/budget-vs-actual', { params: { on_date } }),
  savingsGrowth: () => request<SavingsGrowthRow[]>('/reports/savings-growth'),
  accountBalances: () => request<AccountBalanceRow[]>('/reports/account-balances'),
  outstandingLoans: () => request<LoanReportRow[]>('/reports/outstanding-loans'),
  recurringSchedule: () => request<RecurringScheduleRow[]>('/reports/recurring-schedule'),
  exportReport: (params: {
    report: string;
    format: 'xlsx' | 'pdf';
    date_from?: string;
    date_to?: string;
    year?: number;
    member_id?: string;
  }) =>
    downloadFile(
      '/reports/export',
      { ...params },
      `${params.report}_${new Date().toISOString().slice(0, 10)}.${params.format}`,
    ),
};

// --------------------------------------------------------------------------
// Notifications, audit, settings
// --------------------------------------------------------------------------
export const notificationsApi = {
  list: (unreadOnly = false) => request<Notification[]>('/notifications', { params: { unread_only: unreadOnly } }),
  counts: () => request<NotificationCounts>('/notifications/count'),
  markRead: (id: Id) => request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<{ message: string }>('/notifications/read-all', { method: 'POST' }),
};

export const auditApi = {
  list: (params: {
    action?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => request<Page<AuditEntry>>('/audit', { params }),
  actions: () => request<string[]>('/audit/actions'),
};

export const settingsApi = {
  get: () => request<HouseholdSettings>('/settings'),
  update: (payload: Partial<HouseholdSettings>) =>
    request<HouseholdSettings>('/settings', { method: 'PATCH', body: payload }),
  household: () => request<Household>('/households/current'),
  renameHousehold: (name: string) =>
    request<Household>('/households/current', { method: 'PATCH', body: { name } }),
  system: () => request<SystemInfo>('/settings/system'),
};
