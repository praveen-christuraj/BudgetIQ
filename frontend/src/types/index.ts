// Shared API types. Money values arrive as JSON numbers produced from Decimal
// arithmetic on the backend.

export type Role = 'admin' | 'member';
export type Scope = 'shared' | 'personal';
export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'draft' | 'posted' | 'reversed';
export type AccountType =
  | 'cash'
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'fixed_deposit'
  | 'investment'
  | 'other';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BudgetStatus = 'ok' | 'warning' | 'critical';
export type Severity = 'info' | 'warning' | 'critical' | 'success';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthContextPayload {
  user: User;
  household_id: string;
  household_name: string;
  role: Role;
  display_color: string;
  relationship_label: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  context: AuthContextPayload;
}

export interface SetupStatus {
  initialized: boolean;
  household_name: string | null;
}

export interface Member {
  id: string;
  user_id: string;
  household_id: string;
  full_name: string;
  email: string;
  role: Role;
  relationship_label: string | null;
  display_color: string;
  is_active: boolean;
  joined_at: string;
  last_login_at: string | null;
  account_count: number;
  transaction_count: number;
  total_income: number;
  total_expenses: number;
}

export interface Account {
  id: string;
  name: string;
  account_type: AccountType;
  owner_user_id: string | null;
  owner_name: string | null;
  is_shared: boolean;
  institution: string | null;
  account_number_last4: string | null;
  opening_balance: number;
  current_balance: number;
  currency: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Subcategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: TransactionType;
  color: string;
  icon: string | null;
  is_active: boolean;
  is_system: boolean;
  subcategories: Subcategory[];
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  transaction_type: TransactionType;
  scope: Scope;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string;
  notes: string | null;
  payment_method: string;
  status: TransactionStatus;
  account_id: string;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  created_by: string;
  created_by_name: string | null;
  is_editable: boolean;
  reversal_reason: string | null;
  reversed_at: string | null;
  duplicate_of_id: string | null;
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface DuplicateWarning {
  transaction_id: string;
  description: string;
  amount: number;
  transaction_date: string;
  account_id: string;
}

export interface TransactionCreateResult {
  transaction: Transaction;
  duplicate_warnings: DuplicateWarning[];
}

export interface TransactionFilters {
  q?: string;
  transaction_type?: TransactionType;
  scope?: Scope;
  status?: TransactionStatus;
  member_id?: string;
  account_id?: string;
  category_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface Transfer {
  id: string;
  from_account_id: string;
  from_account_name: string | null;
  to_account_id: string;
  to_account_name: string | null;
  amount: number;
  currency: string;
  transfer_date: string;
  description: string | null;
  status: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

export interface BudgetAllocation {
  id: string;
  category_id: string;
  category_name: string | null;
  category_color: string | null;
  planned_amount: number;
  carry_forward_amount: number;
  actual_amount: number;
  remaining_amount: number;
  utilization_percent: number;
  status: BudgetStatus;
  note: string | null;
}

export interface Budget {
  id: string;
  name: string;
  period_type: 'monthly' | 'annual';
  start_date: string;
  end_date: string;
  owner_user_id: string | null;
  owner_name: string | null;
  is_family_budget: boolean;
  carry_forward: boolean;
  status: string;
  notes: string | null;
  total_planned: number;
  total_actual: number;
  total_remaining: number;
  utilization_percent: number;
  allocations: BudgetAllocation[];
  created_at: string;
}

export interface BudgetSummary {
  budget: Budget;
  unbudgeted_actual: number;
  total_income: number;
  total_expenses: number;
  warning_threshold: number;
  critical_threshold: number;
}

export interface RecurringRule {
  id: string;
  name: string;
  transaction_type: TransactionType;
  scope: Scope;
  owner_user_id: string | null;
  owner_name: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string;
  account_name: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  payment_method: string;
  description: string | null;
  notes: string | null;
  is_active: boolean;
  days_until_due: number | null;
  created_at: string;
}

export interface Contribution {
  id: string;
  goal_id: string;
  amount: number;
  contribution_date: string;
  account_id: string | null;
  account_name: string | null;
  notes: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  remaining_amount: number;
  progress_percent: number;
  target_date: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  is_shared: boolean;
  account_id: string | null;
  account_name: string | null;
  status: string;
  notes: string | null;
  contributions: Contribution[];
  created_at: string;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  amount: number;
  principal_component: number;
  interest_component: number;
  repayment_date: string;
  account_id: string | null;
  account_name: string | null;
  notes: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  direction: 'borrowed' | 'lent';
  counterparty: string;
  principal_amount: number;
  interest_rate: number | null;
  start_date: string;
  due_date: string | null;
  account_id: string | null;
  status: string;
  notes: string | null;
  total_repaid: number;
  principal_repaid: number;
  interest_paid: number;
  outstanding_balance: number;
  repayment_progress_percent: number;
  is_overdue: boolean;
  repayments: LoanRepayment[];
  created_at: string;
}

export interface DashboardTotals {
  total_income: number;
  total_expenses: number;
  remaining_cash_flow: number;
  total_savings_contributions: number;
  total_account_balance: number;
  budget_utilization_percent: number;
  budget_planned: number;
  budget_actual: number;
  savings_goal_total: number;
  savings_goal_target: number;
  loan_outstanding: number;
  unread_notifications: number;
}

export interface TrendPoint {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategorySlice {
  category_id: string | null;
  name: string;
  color: string;
  amount: number;
  percent: number;
}

export interface MemberSpend {
  member_id: string | null;
  name: string;
  color: string;
  income: number;
  expenses: number;
}

export interface UpcomingPayment {
  kind: 'recurring' | 'loan' | string;
  id: string;
  title: string;
  amount: number;
  due_date: string;
  days_until: number;
  account: string | null;
  type: TransactionType;
}

export interface DashboardBudgetCard {
  id: string;
  name: string;
  owner: string;
  planned: number;
  actual: number;
  utilization: number;
  warning_threshold: number;
  critical_threshold: number;
}

export interface Dashboard {
  view: 'family' | 'personal';
  month: string;
  totals: DashboardTotals;
  trend: TrendPoint[];
  category_breakdown: CategorySlice[];
  member_breakdown: MemberSpend[];
  upcoming_payments: UpcomingPayment[];
  recent_transactions: Transaction[];
  active_budgets: DashboardBudgetCard[];
}

export interface MonthlySummary {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  savings_contributions: number;
  transfers: number;
  transaction_count: number;
}

export interface AnnualSummary {
  year: number;
  months: MonthlySummary[];
  total_income: number;
  total_expenses: number;
  net: number;
  total_savings: number;
}

export interface CategoryReportRow {
  category_id: string | null;
  category: string;
  color: string;
  amount: number;
  percent: number;
  transaction_count: number;
}

export interface MemberReportRow {
  member_id: string | null;
  member: string;
  color: string;
  income: number;
  expenses: number;
  net: number;
  shared_expenses: number;
  personal_expenses: number;
}

export interface ScopeReport {
  shared_income: number;
  personal_income: number;
  shared_expenses: number;
  personal_expenses: number;
  shared_percent: number;
  personal_percent: number;
}

export interface AccountBalanceRow {
  account_id: string;
  name: string;
  account_type: AccountType;
  owner: string;
  opening_balance: number;
  income: number;
  expenses: number;
  transfers_in: number;
  transfers_out: number;
  current_balance: number;
}

export interface LoanReportRow {
  loan_id: string;
  counterparty: string;
  direction: 'borrowed' | 'lent';
  principal: number;
  repaid: number;
  outstanding: number;
  due_date: string | null;
  status: string;
  is_overdue: boolean;
}

export interface RecurringScheduleRow {
  rule_id: string;
  name: string;
  frequency: Frequency;
  amount: number;
  next_due_date: string;
  days_until_due: number;
  account: string;
  responsible: string | null;
  is_active: boolean;
}

export interface SavingsGrowthRow {
  goal_id: string;
  goal: string;
  target: number;
  current: number;
  progress_percent: number;
}

export interface BudgetVsActualRow {
  budget_id: string;
  budget: string;
  period: string;
  owner: string;
  planned: number;
  actual: number;
  remaining: number;
  utilization_percent: number;
}

export interface Notification {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationCounts {
  total: number;
  unread: number;
  warning: number;
  critical: number;
}

export interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  before_json: string | null;
  after_json: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
}

export interface HouseholdSettings {
  household_id: string;
  currency: string;
  currency_symbol: string;
  timezone: string;
  date_format: string;
  fiscal_year_start_month: number;
  budget_warning_threshold: number;
  budget_critical_threshold: number;
  notification_lead_days: number;
  backup_retention_days: number;
}

export interface SystemInfo {
  app_name: string;
  version: string;
  environment: string;
  database: string;
  max_upload_mb: number;
  allowed_upload_types: string[];
  session_minutes: number;
  refresh_days: number;
  timezone: string;
}
