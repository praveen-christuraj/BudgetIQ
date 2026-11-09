import {
  Alert,
  Button,
  Card,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { ScopeChip } from '@/components/common/StatusChip';
import { accountsApi, categoriesApi, membersApi, recurringApi, settingsApi } from '@/services/endpoints';
import type { Frequency, RecurringRule } from '@/types';
import { formatDate, todayISO } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';
import { FREQUENCY_OPTIONS, PAYMENT_METHODS } from '@/utils/status';

interface RuleForm {
  name: string;
  transaction_type: 'income' | 'expense';
  scope: 'shared' | 'personal';
  owner_user_id: string;
  account_id: string;
  category_id: string;
  responsible_user_id: string;
  amount: string;
  frequency: Frequency;
  start_date: string;
  end_date: string;
  next_due_date: string;
  payment_method: string;
  description: string;
  notes: string;
}

const emptyForm = (): RuleForm => ({
  name: '',
  transaction_type: 'expense',
  scope: 'shared',
  owner_user_id: '',
  account_id: '',
  category_id: '',
  responsible_user_id: '',
  amount: '',
  frequency: 'monthly',
  start_date: todayISO(),
  end_date: '',
  next_due_date: todayISO(),
  payment_method: 'bank_transfer',
  description: '',
  notes: '',
});

export function RecurringPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<RecurringRule | null>(null);

  const { data: rules = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['recurring'], queryFn: () => recurringApi.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list(false) });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list() });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        transaction_type: form.transaction_type,
        scope: form.scope,
        owner_user_id: form.scope === 'personal' ? form.owner_user_id || context?.user.id : null,
        account_id: form.account_id,
        category_id: form.category_id || null,
        responsible_user_id: form.responsible_user_id || null,
        amount: Number(form.amount),
        frequency: form.frequency,
        start_date: form.start_date,
        end_date: form.end_date || null,
        next_due_date: form.next_due_date,
        payment_method: form.payment_method,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
      };
      return editing ? recurringApi.update(editing.id, payload) : recurringApi.create(payload);
    },
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setEditing(null);
      notify(editing ? 'Recurring rule updated' : 'Recurring rule created');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => recurringApi.generate(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      notify(result.message, result.created ? 'success' : 'info');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const generateDueMutation = useMutation({
    mutationFn: recurringApi.generateDue,
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      notify(result.message, result.created ? 'success' : 'info');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => recurringApi.deactivate(id),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDeactivating(null);
      notify('Recurring rule deactivated');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), account_id: accounts[0]?.id ?? '' });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (rule: RecurringRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      transaction_type: rule.transaction_type,
      scope: rule.scope,
      owner_user_id: rule.owner_user_id ?? '',
      account_id: rule.account_id,
      category_id: rule.category_id ?? '',
      responsible_user_id: rule.responsible_user_id ?? '',
      amount: String(rule.amount),
      frequency: rule.frequency,
      start_date: rule.start_date,
      end_date: rule.end_date ?? '',
      next_due_date: rule.next_due_date,
      payment_method: rule.payment_method,
      description: rule.description ?? '',
      notes: rule.notes ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const dueSoon = rules.filter((rule) => rule.is_active && (rule.days_until_due ?? 999) <= 7).length;
  const monthlyCommitment = rules
    .filter((rule) => rule.is_active && rule.transaction_type === 'expense')
    .reduce((sum, rule) => sum + rule.amount, 0);

  return (
    <>
      <PageHeader
        title="Recurring payments"
        subtitle="Bills, subscriptions, salary and commitments. Due items create drafts — never automatic payments."
        actions={
          <>
            <Button variant="outlined" startIcon={<PlaylistAddCheckRoundedIcon />} onClick={() => generateDueMutation.mutate()} disabled={generateDueMutation.isPending}>
              Generate due drafts
            </Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
              Add recurring rule
            </Button>
          </>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Active rules</Typography>
            <Typography variant="h2" sx={{ fontSize: '1.5rem' }}>{rules.filter((rule) => rule.is_active).length}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Due within 7 days</Typography>
            <Typography variant="h2" sx={{ fontSize: '1.5rem', color: dueSoon ? 'warning.main' : 'text.primary' }}>{dueSoon}</Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Recurring commitments</Typography>
            <MoneyText value={monthlyCommitment} symbol={symbol} variant="h2" display="block" sx={{ fontSize: '1.5rem' }} />
          </Card>
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mb: 3 }}>
        Generating a due draft never marks a bill as paid. Review the draft, then post it once the payment actually
        happens — this keeps budgets and balances accurate.
      </Alert>

      <Card>
        {isLoading ? (
          <LoadingBlock label="Loading recurring rules…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load recurring rules'} onRetry={() => void refetch()} />
        ) : rules.length ? (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 880 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Rule</TableCell>
                  <TableCell>Frequency</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Responsible</TableCell>
                  <TableCell>Next due</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => {
                  const overdue = (rule.days_until_due ?? 0) < 0;
                  return (
                    <TableRow key={rule.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" fontWeight={600}>{rule.name}</Typography>
                          <ScopeChip scope={rule.scope} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {rule.category_name ?? 'Uncategorised'} · {rule.transaction_type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={rule.frequency} sx={{ textTransform: 'capitalize' }} />
                      </TableCell>
                      <TableCell>{rule.account_name}</TableCell>
                      <TableCell>{rule.responsible_name ?? '—'}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDate(rule.next_due_date)}</Typography>
                        <Typography variant="caption" color={overdue ? 'error.main' : (rule.days_until_due ?? 0) <= 3 ? 'warning.main' : 'text.secondary'}>
                          {rule.days_until_due === null
                            ? ''
                            : rule.days_until_due < 0
                              ? `${Math.abs(rule.days_until_due)} days overdue`
                              : rule.days_until_due === 0
                                ? 'Due today'
                                : `in ${rule.days_until_due} days`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <MoneyText value={rule.amount} symbol={symbol} variant="body2" fontWeight={600} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={rule.is_active ? 'success' : 'default'} variant="outlined" label={rule.is_active ? 'Active' : 'Inactive'} sx={{ height: 22, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Generate draft for this rule">
                          <span>
                            <IconButton size="small" disabled={!rule.is_active} onClick={() => generateMutation.mutate(rule.id)} aria-label="Generate draft">
                              <EventRepeatRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(rule)} aria-label="Edit rule">
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {rule.is_active && (
                          <Tooltip title="Deactivate">
                            <IconButton size="small" color="error" onClick={() => setDeactivating(rule)} aria-label="Deactivate rule">
                              <StopCircleRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState
            title="No recurring payments yet"
            description="Add rent, school fees, electricity, subscriptions or salary so nothing gets missed."
            icon={<EventRepeatRoundedIcon fontSize="inherit" />}
            action={<Button size="small" variant="contained" onClick={openCreate}>Add recurring rule</Button>}
          />
        )}
      </Card>

      <FormDialog
        open={dialogOpen}
        title={editing ? `Edit ${editing.name}` : 'Add recurring rule'}
        description="The system will surface upcoming due dates and can create draft transactions for review."
        submitLabel={editing ? 'Save changes' : 'Create rule'}
        loading={saveMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => {
          setFormError(null);
          if (form.name.trim().length < 2) {
            setFormError('Name is required.');
            return;
          }
          if (!Number(form.amount) || Number(form.amount) <= 0) {
            setFormError('Amount must be greater than zero.');
            return;
          }
          if (!form.account_id) {
            setFormError('Choose the account used for this commitment.');
            return;
          }
          if (form.end_date && form.end_date < form.start_date) {
            setFormError('End date must be on or after the start date.');
            return;
          }
          saveMutation.mutate();
        }}
        maxWidth="md"
      >
        {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. House rent" required />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label="Type" value={form.transaction_type} onChange={(event) => setForm({ ...form, transaction_type: event.target.value as 'income' | 'expense' })}>
                <MenuItem value="expense">Expense</MenuItem>
                <MenuItem value="income">Income</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Amount (₹)" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} inputProps={{ min: 0.01, step: '0.01' }} />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField select label="Frequency" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value as Frequency })}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="Account" value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })}>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <TextField label="Start date" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="End date (optional)" type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Next due date" type="date" value={form.next_due_date} onChange={(event) => setForm({ ...form, next_due_date: event.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label="Payment method" value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method} value={method}>{method.replace('_', ' ')}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField select label="Scope" value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as 'shared' | 'personal' })}>
                <MenuItem value="shared">Shared</MenuItem>
                <MenuItem value="personal">Personal</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                label="Owner"
                value={form.owner_user_id}
                onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}
                disabled={form.scope === 'shared' || !isAdmin}
                helperText={form.scope === 'shared' ? 'Household owned' : undefined}
              >
                <MenuItem value="">{isAdmin ? 'Me' : 'Myself'}</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.user_id} value={member.user_id}>{member.full_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField select label="Responsible member" value={form.responsible_user_id} onChange={(event) => setForm({ ...form, responsible_user_id: event.target.value })}>
                <MenuItem value="">Not assigned</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.user_id} value={member.user_id}>{member.full_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
          <TextField select label="Category" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
            <MenuItem value="">Uncategorised</MenuItem>
            {categories.filter((category) => category.kind === form.transaction_type).map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Description for generated drafts" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Defaults to the rule name" />
          <TextField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} multiline minRows={2} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch checked disabled />
            <Typography variant="caption" color="text.secondary">Rule is active when created</Typography>
          </Stack>
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deactivating)}
        title="Deactivate this recurring rule?"
        description="No further drafts will be generated. Existing drafts and transactions are kept."
        confirmLabel="Deactivate"
        tone="error"
        loading={deactivateMutation.isPending}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && deactivateMutation.mutate(deactivating.id)}
      />
    </>
  );
}
