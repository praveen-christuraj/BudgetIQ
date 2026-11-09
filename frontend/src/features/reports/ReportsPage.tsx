import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';

import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { MemberChart } from '@/components/charts/MemberChart';
import { ScopeChart } from '@/components/charts/ScopeChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, LoadingBlock } from '@/components/common/StateBlocks';
import { reportsApi, settingsApi } from '@/services/endpoints';
import { formatDate, formatMoney, formatPercent } from '@/utils/format';
import { budgetStatusColor } from '@/utils/status';

export const REPORT_TABS = [
  { key: 'monthly', label: 'Monthly', export: 'monthly-summary' },
  { key: 'annual', label: 'Annual summary', export: 'annual-summary' },
  { key: 'category', label: 'Categories', export: 'category-expenses' },
  { key: 'members', label: 'Members', export: 'member-summary' },
  { key: 'scope', label: 'Shared vs personal', export: 'shared-vs-personal' },
  { key: 'budgets', label: 'Budgets', export: 'budget-vs-actual' },
  { key: 'savings', label: 'Savings', export: 'savings-growth' },
  { key: 'accounts', label: 'Accounts', export: 'account-balances' },
  { key: 'loans', label: 'Loans', export: 'outstanding-loans' },
  { key: 'recurring', label: 'Recurring', export: 'recurring-schedule' },
] as const;

export type ReportTabKey = (typeof REPORT_TABS)[number]['key'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function currentYear(): number {
  return new Date().getFullYear();
}

function yearStart(year: number): string {
  return `${year}-01-01`;
}

function yearEnd(year: number): string {
  return `${year}-12-31`;
}

export function ReportsPage() {
  const { notify } = useFeedback();
  const [tab, setTab] = useState<ReportTabKey>('annual');
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dateFrom, setDateFrom] = useState(yearStart(currentYear()));
  const [dateTo, setDateTo] = useState(yearEnd(currentYear()));

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const annual = useQuery({
    queryKey: ['reports', 'annual', year],
    queryFn: () => reportsApi.annualSummary(year),
    enabled: tab === 'annual',
  });
  const monthly = useQuery({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => reportsApi.monthlySummary(year, month),
    enabled: tab === 'monthly',
  });
  const category = useQuery({
    queryKey: ['reports', 'category', dateFrom, dateTo],
    queryFn: () => reportsApi.categoryExpenses({ date_from: dateFrom, date_to: dateTo }),
    enabled: tab === 'category',
  });
  const members = useQuery({
    queryKey: ['reports', 'members', dateFrom, dateTo],
    queryFn: () => reportsApi.memberSummary({ date_from: dateFrom, date_to: dateTo }),
    enabled: tab === 'members',
  });
  const scope = useQuery({
    queryKey: ['reports', 'scope', dateFrom, dateTo],
    queryFn: () => reportsApi.sharedVsPersonal({ date_from: dateFrom, date_to: dateTo }),
    enabled: tab === 'scope',
  });
  const budgets = useQuery({ queryKey: ['reports', 'budget-vs-actual'], queryFn: () => reportsApi.budgetVsActual(), enabled: tab === 'budgets' });
  const savings = useQuery({ queryKey: ['reports', 'savings-growth'], queryFn: reportsApi.savingsGrowth, enabled: tab === 'savings' });
  const accounts = useQuery({ queryKey: ['reports', 'account-balances'], queryFn: reportsApi.accountBalances, enabled: tab === 'accounts' });
  const loans = useQuery({ queryKey: ['reports', 'outstanding-loans'], queryFn: reportsApi.outstandingLoans, enabled: tab === 'loans' });
  const recurring = useQuery({ queryKey: ['reports', 'recurring-schedule'], queryFn: reportsApi.recurringSchedule, enabled: tab === 'recurring' });

  const trend = useMemo(
    () =>
      (annual.data?.months ?? []).map((month) => ({
        month: month.month,
        label: month.label.slice(0, 3),
        income: month.income,
        expenses: month.expenses,
        net: month.net,
      })),
    [annual.data],
  );

  const loading =
    (tab === 'monthly' && monthly.isLoading) ||
    (tab === 'annual' && annual.isLoading) ||
    (tab === 'category' && category.isLoading) ||
    (tab === 'members' && members.isLoading) ||
    (tab === 'scope' && scope.isLoading) ||
    (tab === 'budgets' && budgets.isLoading) ||
    (tab === 'savings' && savings.isLoading) ||
    (tab === 'accounts' && accounts.isLoading) ||
    (tab === 'loans' && loans.isLoading) ||
    (tab === 'recurring' && recurring.isLoading);

  const exportReport = async (format: 'xlsx' | 'pdf') => {
    const config = REPORT_TABS.find((item) => item.key === tab)!;
    try {
      await reportsApi.exportReport({
        report: config.export,
        format,
        year,
        ...(tab === 'annual' || tab === 'monthly' ? {} : { date_from: dateFrom, date_to: dateTo }),
      });
      notify(`${format === 'pdf' ? 'PDF' : 'Excel'} report downloaded`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Export failed', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="Monthly, annual, member-wise and category-wise insight into your household finances."
        actions={
          <>
            <Button variant="outlined" startIcon={<FileDownloadRoundedIcon />} onClick={() => void exportReport('xlsx')}>
              Excel
            </Button>
            <Button variant="outlined" startIcon={<PictureAsPdfRoundedIcon />} onClick={() => void exportReport('pdf')}>
              PDF
            </Button>
          </>
        }
      />

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: ReportTabKey) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          {REPORT_TABS.map((item) => (
            <Tab key={item.key} value={item.key} label={item.label} />
          ))}
        </Tabs>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2 }} alignItems={{ sm: 'center' }}>
          {tab === 'annual' || tab === 'monthly' || tab === 'budgets' ? (
            <>
              <TextField
                select
                label="Year"
                value={year}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setYear(next);
                  setDateFrom(yearStart(next));
                  setDateTo(yearEnd(next));
                }}
                sx={{ maxWidth: 160 }}
              >
                {[currentYear(), currentYear() - 1, currentYear() - 2, currentYear() - 3].map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
              {tab === 'monthly' && (
                <TextField
                  select
                  label="Month"
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  sx={{ maxWidth: 180 }}
                >
                  {MONTHS.map((label, index) => (
                    <MenuItem key={label} value={index + 1}>{label}</MenuItem>
                  ))}
                </TextField>
              )}
            </>
          ) : (
            <>
              <TextField label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 190 }} />
              <TextField label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 190 }} />
              <Button
                size="small"
                color="inherit"
                onClick={() => {
                  setDateFrom(yearStart(year));
                  setDateTo(yearEnd(year));
                }}
              >
                Reset to year
              </Button>
            </>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Posted transactions only · drafts and reversed records excluded
          </Typography>
        </Stack>
      </Card>

      {loading ? (
        <LoadingBlock label="Calculating report…" minHeight={320} />
      ) : (
        <Card sx={{ p: { xs: 2, md: 2.5 } }}>
          {tab === 'monthly' && monthly.data && (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Income</Typography>
                  <MoneyText value={monthly.data.income} symbol={symbol} variant="h5" display="block" tone="positive" />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Expenses</Typography>
                  <MoneyText value={monthly.data.expenses} symbol={symbol} variant="h5" display="block" tone="negative" />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Net cash flow</Typography>
                  <MoneyText value={monthly.data.net} symbol={symbol} variant="h5" display="block" tone={monthly.data.net < 0 ? 'negative' : 'positive'} />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Savings contributions</Typography>
                  <MoneyText value={monthly.data.savings_contributions} symbol={symbol} variant="h5" display="block" />
                </Grid>
              </Grid>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell align="right">Income</TableCell>
                      <TableCell align="right">Expenses</TableCell>
                      <TableCell align="right">Net</TableCell>
                      <TableCell align="right">Savings</TableCell>
                      <TableCell align="right">Transfers</TableCell>
                      <TableCell align="right">Transactions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow hover>
                      <TableCell>{monthly.data.label}</TableCell>
                      <TableCell align="right">{formatMoney(monthly.data.income, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(monthly.data.expenses, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(monthly.data.net, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(monthly.data.savings_contributions, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(monthly.data.transfers, { symbol })}</TableCell>
                      <TableCell align="right">{monthly.data.transaction_count}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Alert severity="info">
                Transfers between accounts are excluded from income and expenses. Savings contributions are shown
                separately because money moved into a goal is not spending.
              </Alert>
            </Stack>
          )}

          {tab === 'annual' && annual.data && (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Total income</Typography>
                  <MoneyText value={annual.data.total_income} symbol={symbol} variant="h5" display="block" tone="positive" />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Total expenses</Typography>
                  <MoneyText value={annual.data.total_expenses} symbol={symbol} variant="h5" display="block" tone="negative" />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Net cash flow</Typography>
                  <MoneyText value={annual.data.net} symbol={symbol} variant="h5" display="block" tone={annual.data.net >= 0 ? 'positive' : 'negative'} />
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Savings contributions</Typography>
                  <MoneyText value={annual.data.total_savings} symbol={symbol} variant="h5" display="block" />
                </Grid>
              </Grid>
              <TrendChart data={trend} symbol={symbol} height={300} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell align="right">Income</TableCell>
                      <TableCell align="right">Expenses</TableCell>
                      <TableCell align="right">Net</TableCell>
                      <TableCell align="right">Savings</TableCell>
                      <TableCell align="right">Transfers</TableCell>
                      <TableCell align="right">Transactions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {annual.data.months.map((month) => (
                      <TableRow key={month.month} hover>
                        <TableCell>{month.label}</TableCell>
                        <TableCell align="right">{formatMoney(month.income, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(month.expenses, { symbol })}</TableCell>
                        <TableCell align="right">
                          <MoneyText value={month.net} symbol={symbol} tone={month.net >= 0 ? 'positive' : 'negative'} variant="body2" />
                        </TableCell>
                        <TableCell align="right">{formatMoney(month.savings_contributions, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(month.transfers, { symbol })}</TableCell>
                        <TableCell align="right">{month.transaction_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          )}

          {tab === 'category' && (
            <Stack spacing={3}>
              <CategoryDonut data={(category.data ?? []).map((row) => ({ category_id: row.category_id, name: row.category, color: row.color, amount: row.amount, percent: row.percent }))} symbol={symbol} />
              {category.data?.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Share</TableCell>
                      <TableCell align="right">Transactions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {category.data.map((row) => (
                      <TableRow key={row.category} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: row.color }} />
                            {row.category}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{formatMoney(row.amount, { symbol })}</TableCell>
                        <TableCell align="right">{formatPercent(row.percent, 1)}</TableCell>
                        <TableCell align="right">{row.transaction_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title="No expenses in this period" />
              )}
            </Stack>
          )}

          {tab === 'members' && (
            <Stack spacing={3}>
              <MemberChart data={(members.data ?? []).map((row) => ({ member_id: row.member_id, name: row.member, color: row.color, income: row.income, expenses: row.expenses }))} symbol={symbol} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Member</TableCell>
                    <TableCell align="right">Income</TableCell>
                    <TableCell align="right">Expenses</TableCell>
                    <TableCell align="right">Net</TableCell>
                    <TableCell align="right">Shared</TableCell>
                    <TableCell align="right">Personal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(members.data ?? []).map((row) => (
                    <TableRow key={row.member} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: row.color }} />
                          {row.member}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{formatMoney(row.income, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.expenses, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.net, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.shared_expenses, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.personal_expenses, { symbol })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          )}

          {tab === 'scope' && scope.data && (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ p: 2.5 }}>
                    <Typography variant="h6">Shared household spending</Typography>
                    <MoneyText value={scope.data.shared_expenses} symbol={symbol} variant="h3" display="block" sx={{ my: 1 }} />
                    <LinearProgress variant="determinate" value={scope.data.shared_percent} sx={{ mb: 0.75 }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatPercent(scope.data.shared_percent, 1)} of total expenses · income {formatMoney(scope.data.shared_income, { symbol })}
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ p: 2.5 }}>
                    <Typography variant="h6">Personal spending</Typography>
                    <MoneyText value={scope.data.personal_expenses} symbol={symbol} variant="h3" display="block" sx={{ my: 1 }} />
                    <LinearProgress variant="determinate" color="secondary" value={scope.data.personal_percent} sx={{ mb: 0.75 }} />
                    <Typography variant="caption" color="text.secondary">
                      {formatPercent(scope.data.personal_percent, 1)} of total expenses · income {formatMoney(scope.data.personal_income, { symbol })}
                    </Typography>
                  </Card>
                </Grid>
              </Grid>
              <Card variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Income and expenses by scope</Typography>
                <ScopeChart data={scope.data} symbol={symbol} />
              </Card>
              <Alert severity="info">
                A personal expense paid from a shared account still counts as personal spending while the shared
                account balance reflects the payment. Scope and account ownership are independent.
              </Alert>
            </Stack>
          )}

          {tab === 'budgets' && (
            budgets.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Budget</TableCell>
                      <TableCell>Period</TableCell>
                      <TableCell>Owner</TableCell>
                      <TableCell align="right">Planned</TableCell>
                      <TableCell align="right">Actual</TableCell>
                      <TableCell align="right">Remaining</TableCell>
                      <TableCell>Utilisation</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {budgets.data.map((row) => (
                      <TableRow key={row.budget_id} hover>
                        <TableCell>{row.budget}</TableCell>
                        <TableCell>{row.period}</TableCell>
                        <TableCell>{row.owner}</TableCell>
                        <TableCell align="right">{formatMoney(row.planned, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(row.actual, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(row.remaining, { symbol })}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(row.utilization_percent, 100)}
                              color={budgetStatusColor(row.utilization_percent >= 100 ? 'critical' : row.utilization_percent >= 80 ? 'warning' : 'ok')}
                              sx={{ width: 80 }}
                            />
                            <Typography variant="caption">{formatPercent(row.utilization_percent)}</Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No active budgets" description="Create a monthly budget to see planned versus actual spending." />
            )
          )}

          {tab === 'savings' && (
            savings.data?.length ? (
              <Stack spacing={2.5}>
                {savings.data.map((row) => (
                  <Box key={row.goal_id}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="body2" fontWeight={600}>{row.goal}</Typography>
                      <Typography variant="body2">
                        {formatMoney(row.current, { symbol })}{' '}
                        <Typography component="span" variant="caption" color="text.secondary">
                          of {formatMoney(row.target, { symbol })}
                        </Typography>
                      </Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(row.progress_percent, 100)} sx={{ mt: 0.75 }} />
                    <Typography variant="caption" color="text.secondary">{formatPercent(row.progress_percent, 1)} complete</Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <EmptyState title="No savings goals" />
            )
          )}

          {tab === 'accounts' && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell align="right">Opening</TableCell>
                    <TableCell align="right">Income</TableCell>
                    <TableCell align="right">Expenses</TableCell>
                    <TableCell align="right">Transfers in</TableCell>
                    <TableCell align="right">Transfers out</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(accounts.data ?? []).map((row) => (
                    <TableRow key={row.account_id} hover>
                      <TableCell>
                        <Typography variant="body2">{row.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.account_type.replace('_', ' ')}</Typography>
                      </TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell align="right">{formatMoney(row.opening_balance, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.income, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.expenses, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.transfers_in, { symbol })}</TableCell>
                      <TableCell align="right">{formatMoney(row.transfers_out, { symbol })}</TableCell>
                      <TableCell align="right">
                        <MoneyText value={row.current_balance} symbol={symbol} fontWeight={700} variant="body2" tone={row.current_balance < 0 ? 'negative' : 'default'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {tab === 'loans' && (
            loans.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Counterparty</TableCell>
                      <TableCell>Direction</TableCell>
                      <TableCell align="right">Principal</TableCell>
                      <TableCell align="right">Repaid</TableCell>
                      <TableCell align="right">Outstanding</TableCell>
                      <TableCell>Due</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loans.data.map((row) => (
                      <TableRow key={row.loan_id} hover>
                        <TableCell>{row.counterparty}</TableCell>
                        <TableCell>{row.direction === 'borrowed' ? 'Borrowed' : 'Lent'}</TableCell>
                        <TableCell align="right">{formatMoney(row.principal, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(row.repaid, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(row.outstanding, { symbol })}</TableCell>
                        <TableCell>{row.due_date ? formatDate(row.due_date) : '—'}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" color={row.is_overdue ? 'error' : row.status === 'closed' ? 'default' : 'primary'} label={row.is_overdue ? 'Overdue' : row.status} sx={{ height: 22, fontSize: '0.65rem' }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No loans recorded" />
            )
          )}

          {tab === 'recurring' && (
            recurring.data?.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Frequency</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Next due</TableCell>
                      <TableCell align="right">Days</TableCell>
                      <TableCell>Account</TableCell>
                      <TableCell>Responsible</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recurring.data.map((row) => (
                      <TableRow key={row.rule_id} hover>
                        <TableCell>{row.name}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{row.frequency}</TableCell>
                        <TableCell align="right">{formatMoney(row.amount, { symbol })}</TableCell>
                        <TableCell>{formatDate(row.next_due_date)}</TableCell>
                        <TableCell align="right">{row.days_until_due}</TableCell>
                        <TableCell>{row.account}</TableCell>
                        <TableCell>{row.responsible ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="No upcoming recurring payments" />
            )
          )}

        </Card>
      )}
    </>
  );
}
