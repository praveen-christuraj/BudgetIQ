import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import WalletRoundedIcon from '@mui/icons-material/WalletRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { MemberChart } from '@/components/charts/MemberChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { SectionCard } from '@/components/common/SectionCard';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { StatusChipForTransaction } from '@/features/transactions/TransactionChips';
import { reportsApi, settingsApi } from '@/services/endpoints';
import { formatDate, formatMoney, formatPercent, monthLabel } from '@/utils/format';
import { budgetStatusColor } from '@/utils/status';

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function DashboardPage() {
  const { context, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [view, setView] = useState<'family' | 'personal'>('family');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', month, view],
    queryFn: () => reportsApi.dashboard(month, view),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const symbol = settings?.currency_symbol ?? '₹';
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (isError) {
    return <ErrorState message={(error as Error)?.message ?? 'Unable to load the dashboard'} onRetry={() => void refetch()} />;
  }

  const totals = data?.totals;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${context?.user.full_name.split(' ')[0] ?? 'there'}`}
        subtitle={`${monthLabel(month)} overview · ${view === 'family' ? 'whole household' : 'your personal finances'}`}
        actions={
          <>
            <Stack direction="row" spacing={1} alignItems="center">
              <IconButton size="small" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="Previous month">
                <ChevronLeftRoundedIcon fontSize="small" />
              </IconButton>
              <TextField
                type="month"
                value={month}
                onChange={(event) => event.target.value && setMonth(event.target.value)}
                sx={{ width: 150 }}
                inputProps={{ 'aria-label': 'Month' }}
              />
              <IconButton size="small" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="Next month">
                <ChevronRightRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/expenses')}>
              Add expense
            </Button>
          </>
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_event, value: 'family' | 'personal' | null) => value && setView(value)}
          sx={{ backgroundColor: '#fff' }}
        >
          <ToggleButton value="family" sx={{ px: 2.5, fontWeight: 600 }}>
            Family Overview
          </ToggleButton>
          <ToggleButton value="personal" sx={{ px: 2.5, fontWeight: 600 }}>
            My Finances
          </ToggleButton>
        </ToggleButtonGroup>
        {view === 'personal' && !isAdmin && (
          <Chip size="small" variant="outlined" color="secondary" label="Only your records are included" />
        )}
        {view === 'personal' && isAdmin && (
          <Chip size="small" variant="outlined" color="primary" label="Showing your own records as administrator" />
        )}
      </Stack>

      {isLoading ? (
        <LoadingBlock label="Building your dashboard…" minHeight={360} />
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Family income this month"
                value={formatMoney(totals?.total_income, { symbol })}
                icon={<TrendingUpRoundedIcon />}
                tone="positive"
                helper={`${view === 'family' ? 'All posted income' : 'Your recorded income'}`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Total expenses"
                value={formatMoney(totals?.total_expenses, { symbol })}
                icon={<TrendingDownRoundedIcon />}
                tone="negative"
                helper={`${view === 'family' ? 'Shared + personal spending' : 'Your spending'}`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Remaining cash flow"
                value={formatMoney(totals?.remaining_cash_flow, { symbol })}
                icon={<WalletRoundedIcon />}
                tone={(totals?.remaining_cash_flow ?? 0) >= 0 ? 'positive' : 'negative'}
                helper="Income minus expenses"
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Savings contributions"
                value={formatMoney(totals?.total_savings_contributions, { symbol })}
                icon={<SavingsRoundedIcon />}
                helper={`Goal balance ${formatMoney(totals?.savings_goal_total, { symbol })} of ${formatMoney(totals?.savings_goal_target, { symbol })}`}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Budget utilisation"
                value={formatPercent(totals?.budget_utilization_percent)}
                icon={<FactCheckRoundedIcon />}
                tone={(totals?.budget_utilization_percent ?? 0) >= 100 ? 'negative' : (totals?.budget_utilization_percent ?? 0) >= 80 ? 'warning' : 'default'}
                helper={`${formatMoney(totals?.budget_actual, { symbol })} of ${formatMoney(totals?.budget_planned, { symbol })} planned`}
                loading={isLoading}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Account balances"
                value={formatMoney(totals?.total_account_balance, { symbol })}
                icon={<AccountBalanceRoundedIcon />}
                helper={view === 'family' ? 'All shared and member accounts' : 'Your accounts and shared accounts'}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Savings goals"
                value={formatPercent(
                  (totals?.savings_goal_target ?? 0) > 0
                    ? ((totals?.savings_goal_total ?? 0) / (totals?.savings_goal_target ?? 1)) * 100
                    : 0,
                )}
                icon={<SavingsRoundedIcon />}
                helper={`${formatMoney(totals?.savings_goal_total, { symbol })} saved towards ${formatMoney(totals?.savings_goal_target, { symbol })}`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                label="Outstanding loans"
                value={formatMoney(totals?.loan_outstanding, { symbol })}
                icon={<HandshakeRoundedIcon />}
                tone={(totals?.loan_outstanding ?? 0) > 0 ? 'warning' : 'default'}
                helper="Borrowed amounts still to repay"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} lg={7}>
              <SectionCard
                title="Income vs expenses"
                subtitle="Last six months · posted transactions only"
                action={
                  <Button size="small" endIcon={<AssessmentRoundedIcon />} onClick={() => navigate('/reports')}>
                    Reports
                  </Button>
                }
              >
                <TrendChart data={data?.trend ?? []} symbol={symbol} />
              </SectionCard>
            </Grid>
            <Grid item xs={12} lg={5}>
              <SectionCard title="Category distribution" subtitle="Where the money went this month">
                <CategoryDonut data={data?.category_breakdown ?? []} symbol={symbol} />
              </SectionCard>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} lg={7}>
              <SectionCard
                title="Budget progress"
                subtitle="Planned versus actual for active budgets"
                action={<Button size="small" onClick={() => navigate('/budgets')}>Manage</Button>}
              >
                {data?.active_budgets.length ? (
                  <Stack spacing={2.25}>
                    {data.active_budgets.map((budget) => {
                      const status = budget.utilization >= budget.critical_threshold ? 'critical' : budget.utilization >= budget.warning_threshold ? 'warning' : 'ok';
                      return (
                        <Box key={budget.id}>
                          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {budget.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {budget.owner}
                              </Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {formatMoney(budget.actual, { symbol })}
                              <Typography component="span" variant="caption" color="text.secondary">
                                {' '}/ {formatMoney(budget.planned, { symbol })}
                              </Typography>
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(budget.utilization, 100)}
                            color={budgetStatusColor(status)}
                            sx={{ mt: 0.75, backgroundColor: '#EDF1EE' }}
                          />
                        </Box>
                      );
                    })}
                  </Stack>
                ) : (
                  <EmptyState
                    title="No active budget"
                    description="Create a monthly budget to compare planned spending with actual expenses."
                    action={<Button size="small" variant="outlined" onClick={() => navigate('/budgets')}>Create a budget</Button>}
                  />
                )}
              </SectionCard>
            </Grid>
            <Grid item xs={12} lg={5}>
              <SectionCard
                title="Upcoming payments"
                subtitle="Recurring bills and loan commitments"
                action={<Button size="small" onClick={() => navigate('/recurring')}>View all</Button>}
              >
                {data?.upcoming_payments.length ? (
                  <Stack divider={<Divider flexItem />} spacing={0}>
                    {data.upcoming_payments.map((payment) => (
                      <Stack key={`${payment.kind}-${payment.id}`} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.25 }}>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 1.5,
                            display: 'grid',
                            placeItems: 'center',
                            backgroundColor: payment.days_until <= 3 ? 'rgba(198,40,40,0.08)' : 'rgba(27,94,32,0.08)',
                            color: payment.days_until <= 3 ? 'error.main' : 'primary.main',
                            flexShrink: 0,
                          }}
                        >
                          <EventRoundedIcon fontSize="small" />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {payment.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(payment.due_date)} · {payment.account ?? payment.kind}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <MoneyText value={payment.amount} symbol={symbol} variant="body2" fontWeight={600} />
                          <Typography variant="caption" display="block" color={payment.days_until <= 3 ? 'error.main' : 'text.secondary'}>
                            {payment.days_until < 0
                              ? `${Math.abs(payment.days_until)} days overdue`
                              : payment.days_until === 0
                                ? 'Due today'
                                : `in ${payment.days_until} days`}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                  <EmptyState title="Nothing due soon" description="Recurring payments and loan due dates will appear here." />
                )}
              </SectionCard>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} lg={view === 'family' ? 7 : 12}>
              <SectionCard
                title="Recent transactions"
                subtitle="Latest posted records this month"
                action={<Button size="small" onClick={() => navigate('/expenses')}>View all</Button>}
              >
                {data?.recent_transactions.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.recent_transactions.map((transaction) => (
                        <TableRow key={transaction.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(transaction.transaction_date)}</TableCell>
                          <TableCell sx={{ maxWidth: 200 }}>
                            <Tooltip title={transaction.description}>
                              <Typography variant="body2" noWrap>
                                {transaction.description}
                              </Typography>
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary">
                              {transaction.scope === 'shared' ? 'Shared' : transaction.owner_name} · {transaction.account_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: transaction.category_name ? 'primary.main' : 'grey.400' }} />
                              <Typography variant="caption">{transaction.category_name ?? 'Uncategorised'}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <MoneyText
                              value={transaction.transaction_type === 'expense' ? -transaction.amount : transaction.amount}
                              symbol={symbol}
                              signed
                              tone={transaction.transaction_type === 'expense' ? 'negative' : 'positive'}
                              variant="body2"
                              fontWeight={600}
                            />
                            <StatusChipForTransaction status={transaction.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No transactions yet"
                    description="Record your first income or expense to see it here."
                    icon={<ReceiptLongRoundedIcon fontSize="inherit" />}
                    action={
                      <Button size="small" variant="contained" onClick={() => navigate('/expenses')}>
                        Add an expense
                      </Button>
                    }
                  />
                )}
              </SectionCard>
            </Grid>
            {view === 'family' && (
              <Grid item xs={12} lg={5} sx={{ display: data?.member_breakdown.length ? 'block' : 'none' }}>
                <SectionCard title="Member comparison" subtitle="Income and spending by member">
                  <MemberChart data={data?.member_breakdown ?? []} symbol={symbol} />
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {data?.member_breakdown.map((member) => (
                      <Stack key={member.member_id ?? member.name} direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: member.color }}>
                          {member.name.slice(0, 1)}
                        </Avatar>
                        <Typography variant="caption" sx={{ flex: 1 }} noWrap>
                          {member.name}
                        </Typography>
                        <MoneyText value={member.expenses} symbol={symbol} variant="caption" tone="muted" />
                      </Stack>
                    ))}
                  </Stack>
                </SectionCard>
              </Grid>
            )}
          </Grid>
        </>
      )}
    </>
  );
}
