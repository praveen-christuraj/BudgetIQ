import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import ForwardRoundedIcon from '@mui/icons-material/ForwardRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { BudgetStatusChip } from '@/components/common/StatusChip';
import { budgetsApi, categoriesApi, membersApi, settingsApi } from '@/services/endpoints';
import type { Budget, BudgetSummary } from '@/types';
import { formatDate, formatMoney, formatPercent } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';
import { budgetStatusColor } from '@/utils/status';

interface AllocationRow {
  category_id: string;
  planned_amount: string;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(): string {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function BudgetsPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<BudgetSummary | null>(null);
  const [archiving, setArchiving] = useState<Budget | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<'monthly' | 'annual'>('monthly');
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(monthEnd());
  const [ownerId, setOwnerId] = useState('');
  const [carryForward, setCarryForward] = useState(false);
  const [notes, setNotes] = useState('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const { data: budgets = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['budgets', 'all'],
    queryFn: () => budgetsApi.list({}),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list('expense') });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const visibleBudgets = budgets.filter((budget) => (tab === 'active' ? budget.status === 'active' : budget.status !== 'active'));
  const plannedTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.planned_amount || 0), 0);

  useEffect(() => {
    if (periodType === 'monthly' && startDate) {
      const [year, month] = startDate.split('-').map(Number);
      const last = new Date(year, month, 0).getDate();
      setEndDate(`${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
    }
  }, [periodType, startDate]);

  const openCreate = () => {
    const now = new Date();
    setName(`Family budget ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`);
    setPeriodType('monthly');
    setStartDate(monthStart());
    setEndDate(monthEnd());
    setOwnerId('');
    setCarryForward(false);
    setNotes('');
    setAllocations([{ category_id: categories[0]?.id ?? '', planned_amount: '' }]);
    setFormError(null);
    setDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      budgetsApi.create({
        name: name.trim(),
        period_type: periodType,
        start_date: startDate,
        end_date: endDate,
        owner_user_id: ownerId || null,
        carry_forward: carryForward,
        notes: notes.trim() || null,
        allocations: allocations
          .filter((allocation) => allocation.category_id && Number(allocation.planned_amount) >= 0)
          .map((allocation) => ({
            category_id: allocation.category_id,
            planned_amount: Number(allocation.planned_amount || 0),
          })),
      }),
    onSuccess: async (summary) => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setDetail(summary);
      notify('Budget created');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const carryMutation = useMutation({
    mutationFn: (id: string) => budgetsApi.carryForward(id),
    onSuccess: async (summary) => {
      await invalidateFinancialData(queryClient);
      setDetail(summary);
      notify('Carry-forward applied from the previous period');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => budgetsApi.archive(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setArchiving(null);
      setDetail(null);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openDetail = async (budget: Budget) => {
    try {
      const summary = await budgetsApi.get(budget.id);
      setDetail(summary);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load budget', 'error');
    }
  };

  const totals = useMemo(
    () => ({
      planned: visibleBudgets.reduce((sum, budget) => sum + budget.total_planned, 0),
      actual: visibleBudgets.reduce((sum, budget) => sum + budget.total_actual, 0),
    }),
    [visibleBudgets],
  );

  return (
    <>
      <PageHeader
        title="Monthly budgets"
        subtitle="Plan category spending, compare with actual posted expenses and spot overspending early."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            New budget
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Planned across {tab} budgets
            </Typography>
            <MoneyText value={totals.planned} symbol={symbol} variant="h2" display="block" sx={{ fontSize: '1.5rem' }} />
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Actual spending
            </Typography>
            <MoneyText value={totals.actual} symbol={symbol} variant="h2" display="block" sx={{ fontSize: '1.5rem' }} tone="negative" />
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Remaining
            </Typography>
            <MoneyText
              value={totals.planned - totals.actual}
              symbol={symbol}
              variant="h2"
              display="block"
              sx={{ fontSize: '1.5rem' }}
              tone={totals.planned - totals.actual < 0 ? 'negative' : 'positive'}
            />
          </Card>
        </Grid>
      </Grid>

      <Card>
        <Tabs value={tab} onChange={(_event, value: 'active' | 'archived') => setTab(value)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="active" label={`Active (${budgets.filter((b) => b.status === 'active').length})`} />
          <Tab value="archived" label={`Archived (${budgets.filter((b) => b.status !== 'active').length})`} />
        </Tabs>

        {isLoading ? (
          <LoadingBlock label="Loading budgets…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load budgets'} onRetry={() => void refetch()} />
        ) : visibleBudgets.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Budget</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="right">Planned</TableCell>
                <TableCell align="right">Actual</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Utilisation</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleBudgets.map((budget) => (
                <TableRow key={budget.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {budget.name}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                      <Chip size="small" variant="outlined" label={budget.period_type === 'monthly' ? 'Monthly' : 'Annual'} sx={{ height: 18, fontSize: '0.6rem' }} />
                      {budget.carry_forward && <Chip size="small" variant="outlined" color="secondary" label="Carry-forward" sx={{ height: 18, fontSize: '0.6rem' }} />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(budget.start_date)}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      to {formatDate(budget.end_date)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{budget.is_family_budget ? 'Family' : budget.owner_name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <MoneyText value={budget.total_planned} symbol={symbol} variant="body2" />
                  </TableCell>
                  <TableCell align="right">
                    <MoneyText value={budget.total_actual} symbol={symbol} variant="body2" tone="negative" />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(budget.utilization_percent, 100)}
                        color={budgetStatusColor(budget.utilization_percent >= 100 ? 'critical' : budget.utilization_percent >= 80 ? 'warning' : 'ok')}
                        sx={{ flex: 1, backgroundColor: '#EDF1EE' }}
                      />
                      <Typography variant="caption" sx={{ minWidth: 38, textAlign: 'right' }}>
                        {formatPercent(budget.utilization_percent)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View planned vs actual">
                      <IconButton size="small" onClick={() => void openDetail(budget)} aria-label="View budget">
                        <VisibilityRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title={`No ${tab} budgets`}
            description="Create a monthly budget with category allocations to track planned versus actual spending."
            icon={<FactCheckRoundedIcon fontSize="inherit" />}
            action={
              <Button variant="contained" size="small" onClick={openCreate}>
                Create a budget
              </Button>
            }
          />
        )}
      </Card>

      <FormDialog
        open={dialogOpen}
        title="New budget"
        description="Allocate a planned amount per expense category. Members can create their own personal budgets."
        submitLabel="Create budget"
        loading={createMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => {
          setFormError(null);
          if (name.trim().length < 2) {
            setFormError('Give the budget a name.');
            return;
          }
          if (!startDate || !endDate || endDate < startDate) {
            setFormError('End date must be on or after the start date.');
            return;
          }
          if (!allocations.filter((a) => a.category_id).length) {
            setFormError('Add at least one category allocation.');
            return;
          }
          createMutation.mutate();
        }}
        maxWidth="md"
      >
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Stack spacing={2.25}>
          <TextField label="Budget name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField select label="Period" value={periodType} onChange={(event) => setPeriodType(event.target.value as 'monthly' | 'annual')}>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Budget owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                disabled={!isAdmin}
                helperText={ownerId ? 'Personal budget (member + shared entries they recorded)' : 'Family budget (all household expenses)'}
              >
                {isAdmin && <MenuItem value="">Family budget</MenuItem>}
                {members
                  .filter((member) => isAdmin || member.user_id === context?.user.id)
                  .map((member) => (
                    <MenuItem key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </MenuItem>
                  ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Carry forward unspent amounts"
                value={carryForward ? 'yes' : 'no'}
                onChange={(event) => setCarryForward(event.target.value === 'yes')}
              >
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="yes">Yes, from previous period</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Category allocations</Typography>
            <Typography variant="subtitle2">Total {formatMoney(plannedTotal, { symbol })}</Typography>
          </Stack>
          <Stack spacing={1.5}>
            {allocations.map((allocation, index) => (
              <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <TextField
                  select
                  label="Category"
                  value={allocation.category_id}
                  onChange={(event) => {
                    const next = [...allocations];
                    next[index] = { ...next[index], category_id: event.target.value };
                    setAllocations(next);
                  }}
                >
                  {categories.map((category) => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Planned (₹)"
                  type="number"
                  value={allocation.planned_amount}
                  onChange={(event) => {
                    const next = [...allocations];
                    next[index] = { ...next[index], planned_amount: event.target.value };
                    setAllocations(next);
                  }}
                  inputProps={{ min: 0, step: '0.01' }}
                  sx={{ maxWidth: { sm: 200 } }}
                />
                <IconButton
                  color="error"
                  aria-label="Remove allocation"
                  onClick={() => setAllocations(allocations.filter((_, position) => position !== index))}
                  disabled={allocations.length === 1}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setAllocations([...allocations, { category_id: '', planned_amount: '' }])}>
                Add category
              </Button>
            </Box>
          </Stack>
          <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
        </Stack>
      </FormDialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        {detail && (
          <>
            <DialogTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <Box>
                  <Typography variant="h5">{detail.budget.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(detail.budget.start_date)} – {formatDate(detail.budget.end_date)} ·{' '}
                    {detail.budget.is_family_budget ? 'Family budget' : detail.budget.owner_name}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<ForwardRoundedIcon />} onClick={() => carryMutation.mutate(detail.budget.id)}>
                    Carry forward
                  </Button>
                  <Button size="small" color="error" variant="outlined" onClick={() => setArchiving(detail.budget)}>
                    Archive
                  </Button>
                </Stack>
              </Stack>
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Planned</Typography>
                  <MoneyText value={detail.budget.total_planned} symbol={symbol} variant="h6" display="block" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Actual</Typography>
                  <MoneyText value={detail.budget.total_actual} symbol={symbol} variant="h6" display="block" tone="negative" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Remaining</Typography>
                  <MoneyText value={detail.budget.total_remaining} symbol={symbol} variant="h6" display="block" tone={detail.budget.total_remaining < 0 ? 'negative' : 'positive'} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Utilisation</Typography>
                  <Typography variant="h6">{formatPercent(detail.budget.utilization_percent)}</Typography>
                </Grid>
              </Grid>
              {detail.unbudgeted_actual > 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {formatMoney(detail.unbudgeted_actual, { symbol })} was spent in categories that are not part of this budget.
                </Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Planned</TableCell>
                    <TableCell align="right">Actual</TableCell>
                    <TableCell align="right">Remaining</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.budget.allocations.map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: allocation.category_color ?? '#607D8B' }} />
                          <Typography variant="body2">{allocation.category_name}</Typography>
                          {allocation.carry_forward_amount > 0 && (
                            <Chip size="small" variant="outlined" color="secondary" label={`+${formatMoney(allocation.carry_forward_amount, { symbol })} carried`} sx={{ height: 18, fontSize: '0.6rem' }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <MoneyText value={allocation.planned_amount} symbol={symbol} variant="body2" />
                      </TableCell>
                      <TableCell align="right">
                        <MoneyText value={allocation.actual_amount} symbol={symbol} variant="body2" />
                      </TableCell>
                      <TableCell align="right">
                        <MoneyText value={allocation.remaining_amount} symbol={symbol} variant="body2" tone={allocation.remaining_amount < 0 ? 'negative' : 'positive'} />
                      </TableCell>
                      <TableCell>
                        <BudgetStatusChip status={allocation.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive this budget?"
        description="Archived budgets stay available in reports; their history is never deleted."
        confirmLabel="Archive budget"
        tone="error"
        loading={archiveMutation.isPending}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archiveMutation.mutate(archiving.id)}
      />
    </>
  );
}
