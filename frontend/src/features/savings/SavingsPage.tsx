import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { accountsApi, membersApi, savingsApi, settingsApi } from '@/services/endpoints';
import type { SavingsGoal } from '@/types';
import { formatDate, formatMoney, formatPercent, todayISO } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';

export function SavingsPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [goalDialog, setGoalDialog] = useState(false);
  const [contributeTo, setContributeTo] = useState<SavingsGoal | null>(null);
  const [detail, setDetail] = useState<SavingsGoal | null>(null);
  const [archiving, setArchiving] = useState<SavingsGoal | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(todayISO());
  const [contributionAccount, setContributionAccount] = useState('');
  const [contributionNotes, setContributionNotes] = useState('');

  const { data: goals = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['savings', 'goals'], queryFn: savingsApi.goals });
  const { data: overview } = useQuery({ queryKey: ['savings', 'overview'], queryFn: savingsApi.overview });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list(false) });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const createMutation = useMutation({
    mutationFn: () =>
      savingsApi.createGoal({
        name: name.trim(),
        target_amount: Number(targetAmount),
        target_date: targetDate || null,
        owner_user_id: ownerId || null,
        account_id: accountId || null,
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setGoalDialog(false);
      notify('Savings goal created');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const contributeMutation = useMutation({
    mutationFn: () =>
      savingsApi.contribute(contributeTo!.id, {
        amount: Number(contributionAmount),
        contribution_date: contributionDate,
        account_id: contributionAccount || null,
        notes: contributionNotes.trim() || null,
      }),
    onSuccess: async (goal) => {
      await invalidateFinancialData(queryClient);
      setContributeTo(null);
      setDetail(goal);
      notify('Contribution recorded');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const removeContributionMutation = useMutation({
    mutationFn: ({ goalId, contributionId }: { goalId: string; contributionId: string }) =>
      savingsApi.removeContribution(goalId, contributionId),
    onSuccess: async (goal) => {
      await invalidateFinancialData(queryClient);
      setDetail(goal);
      notify('Contribution removed');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => savingsApi.archiveGoal(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setArchiving(null);
      setDetail(null);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setName('');
    setTargetAmount('');
    setTargetDate('');
    setOwnerId('');
    setAccountId('');
    setNotes('');
    setFormError(null);
    setGoalDialog(true);
  };

  return (
    <>
      <PageHeader
        title="Savings goals"
        subtitle="Emergency funds, holidays and education targets. Contributions are tracked separately and never counted as expenses."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            New goal
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard label="Total saved" value={formatMoney(overview?.total_saved, { symbol })} icon={<SavingsRoundedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard label="Target" value={formatMoney(overview?.total_target, { symbol })} helper={`${overview?.active_goals ?? 0} active goal(s)`} />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard label="Overall progress" value={formatPercent(overview?.progress_percent)} tone="positive" />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard label="Goals achieved" value={String(overview?.achieved_goals ?? 0)} helper={`${overview?.goal_count ?? 0} total goals`} />
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mb: 3 }}>
        A transfer from your bank to a savings account is an account transfer. Recording a contribution here tracks the
        goal allocation separately, so savings are never double-counted.
      </Alert>

      {isLoading ? (
        <LoadingBlock label="Loading savings goals…" />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? 'Unable to load goals'} onRetry={() => void refetch()} />
      ) : goals.length ? (
        <Grid container spacing={2}>
          {goals.map((goal) => (
            <Grid item xs={12} sm={6} lg={4} key={goal.id}>
              <Card sx={{ height: '100%', opacity: goal.status === 'archived' ? 0.65 : 1 }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" noWrap>{goal.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {goal.is_shared ? 'Shared family goal' : goal.owner_name} · target {formatDate(goal.target_date)}
                      </Typography>
                    </Box>
                    <Stack direction="row">
                      <Tooltip title="Contributions">
                        <IconButton size="small" onClick={() => setDetail(goal)} aria-label="View contributions">
                          <VisibilityRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Archive">
                        <IconButton size="small" color="error" onClick={() => setArchiving(goal)} aria-label="Archive goal">
                          <ArchiveRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                    <MoneyText value={goal.current_amount} symbol={symbol} variant="h2" sx={{ fontSize: '1.4rem' }} />
                    <Typography variant="caption" color="text.secondary">
                      of {formatMoney(goal.target_amount, { symbol })}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(goal.progress_percent, 100)}
                    color={goal.status === 'achieved' ? 'success' : 'primary'}
                    sx={{ backgroundColor: '#EDF1EE', mb: 1 }}
                  />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {formatPercent(goal.progress_percent)} · remaining {formatMoney(goal.remaining_amount, { symbol })}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={goal.status === 'achieved' ? 'success' : goal.status === 'archived' ? 'default' : 'primary'}
                      label={goal.status === 'achieved' ? 'Achieved' : goal.status === 'archived' ? 'Archived' : 'Active'}
                      sx={{ height: 20, fontSize: '0.62rem' }}
                    />
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddRoundedIcon />}
                    sx={{ mt: 2 }}
                    onClick={() => {
                      setContributeTo(goal);
                      setContributionAmount('');
                      setContributionDate(todayISO());
                      setContributionAccount(goal.account_id ?? '');
                      setContributionNotes('');
                    }}
                    disabled={goal.status === 'archived'}
                  >
                    Add contribution
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Card>
          <EmptyState
            title="No savings goals yet"
            description="Create your first goal — an emergency fund is a great place to start."
            icon={<SavingsRoundedIcon fontSize="inherit" />}
            action={<Button variant="contained" size="small" onClick={openCreate}>Create a goal</Button>}
          />
        </Card>
      )}

      <FormDialog
        open={goalDialog}
        title="New savings goal"
        submitLabel="Create goal"
        loading={createMutation.isPending}
        onClose={() => setGoalDialog(false)}
        onSubmit={() => {
          setFormError(null);
          if (name.trim().length < 2) {
            setFormError('Give the goal a name.');
            return;
          }
          if (!Number(targetAmount) || Number(targetAmount) <= 0) {
            setFormError('Target amount must be greater than zero.');
            return;
          }
          createMutation.mutate();
        }}
      >
        {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
        <Stack spacing={2}>
          <TextField label="Goal name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Emergency fund" required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Target amount (₹)" type="number" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} inputProps={{ min: 1, step: '0.01' }} required />
            <TextField label="Target date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField
            select
            label="Owner"
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            disabled={!isAdmin}
            helperText={ownerId ? 'Personal goal' : 'Shared family goal'}
          >
            {isAdmin && <MenuItem value="">Shared family goal</MenuItem>}
            {members.filter((member) => isAdmin || member.user_id === context?.user.id).map((member) => (
              <MenuItem key={member.user_id} value={member.user_id}>{member.full_name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Linked account (optional)" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <MenuItem value="">No linked account</MenuItem>
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
        </Stack>
      </FormDialog>

      <FormDialog
        open={Boolean(contributeTo)}
        title={`Contribute to ${contributeTo?.name ?? ''}`}
        description="Contributions are goal allocations and do not reduce account balances by themselves."
        submitLabel="Record contribution"
        loading={contributeMutation.isPending}
        onClose={() => setContributeTo(null)}
        onSubmit={() => {
          if (!Number(contributionAmount) || Number(contributionAmount) <= 0) {
            notify('Enter an amount greater than zero', 'error');
            return;
          }
          contributeMutation.mutate();
        }}
      >
        <Stack spacing={2}>
          <TextField label="Amount (₹)" type="number" value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} autoFocus inputProps={{ min: 0.01, step: '0.01' }} />
          <TextField label="Date" type="date" value={contributionDate} onChange={(event) => setContributionDate(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField select label="From account (optional)" value={contributionAccount} onChange={(event) => setContributionAccount(event.target.value)}>
            <MenuItem value="">Not specified</MenuItem>
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Notes" value={contributionNotes} onChange={(event) => setContributionNotes(event.target.value)} />
        </Stack>
      </FormDialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        {detail && (
          <>
            <DialogTitle>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="h5">{detail.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatMoney(detail.current_amount, { symbol })} of {formatMoney(detail.target_amount, { symbol })} · {formatPercent(detail.progress_percent)}
                  </Typography>
                </Box>
                <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => { setDetail(null); setContributeTo(detail); }}>
                  Contribute
                </Button>
              </Stack>
            </DialogTitle>
            <DialogContent>
              {detail.contributions.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Account</TableCell>
                      <TableCell>Recorded by</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...detail.contributions].reverse().map((contribution) => (
                      <TableRow key={contribution.id}>
                        <TableCell>{formatDate(contribution.contribution_date)}</TableCell>
                        <TableCell>{contribution.account_name ?? '—'}</TableCell>
                        <TableCell>{contribution.created_by_name ?? '—'}</TableCell>
                        <TableCell align="right">
                          <MoneyText value={contribution.amount} symbol={symbol} variant="body2" fontWeight={600} />
                        </TableCell>
                        <TableCell align="right">
                          {(isAdmin || contribution.created_by === context?.user.id) && (
                            <Tooltip title="Remove contribution">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() =>
                                  removeContributionMutation.mutate({
                                    goalId: detail.id,
                                    contributionId: contribution.id,
                                  })
                                }
                                aria-label="Remove contribution"
                              >
                                <ArchiveRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No contributions recorded yet.
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive this savings goal?"
        description="The goal and its contribution history remain available in reports."
        confirmLabel="Archive goal"
        tone="error"
        loading={archiveMutation.isPending}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archiveMutation.mutate(archiving.id)}
      />
    </>
  );
}
