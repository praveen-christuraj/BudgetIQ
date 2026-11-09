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
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { accountsApi, loansApi, settingsApi } from '@/services/endpoints';
import type { Loan } from '@/types';
import { formatDate, formatMoney, formatPercent, todayISO } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';

interface LoanForm {
  direction: 'borrowed' | 'lent';
  counterparty: string;
  principal_amount: string;
  interest_rate: string;
  start_date: string;
  due_date: string;
  account_id: string;
  notes: string;
}

const emptyForm = (): LoanForm => ({
  direction: 'borrowed',
  counterparty: '',
  principal_amount: '',
  interest_rate: '',
  start_date: todayISO(),
  due_date: '',
  account_id: '',
  notes: '',
});

export function LoansPage() {
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LoanForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [repayFor, setRepayFor] = useState<Loan | null>(null);
  const [detail, setDetail] = useState<Loan | null>(null);
  const [closing, setClosing] = useState<Loan | null>(null);
  const [repayment, setRepayment] = useState({ amount: '', principal: '', interest: '', date: todayISO(), account_id: '', notes: '' });

  const { data: loans = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['loans'], queryFn: () => loansApi.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list(false) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const borrowedOutstanding = loans.filter((loan) => loan.direction === 'borrowed' && loan.status === 'active').reduce((sum, loan) => sum + loan.outstanding_balance, 0);
  const lentOutstanding = loans.filter((loan) => loan.direction === 'lent' && loan.status === 'active').reduce((sum, loan) => sum + loan.outstanding_balance, 0);

  const createMutation = useMutation({
    mutationFn: () =>
      loansApi.create({
        direction: form.direction,
        counterparty: form.counterparty.trim(),
        principal_amount: Number(form.principal_amount),
        interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
        start_date: form.start_date,
        due_date: form.due_date || null,
        account_id: form.account_id || null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      notify('Loan recorded');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const repayMutation = useMutation({
    mutationFn: () =>
      loansApi.addRepayment(repayFor!.id, {
        amount: Number(repayment.amount),
        principal_component: repayment.principal ? Number(repayment.principal) : undefined,
        interest_component: repayment.interest ? Number(repayment.interest) : undefined,
        repayment_date: repayment.date,
        account_id: repayment.account_id || null,
        notes: repayment.notes.trim() || null,
      }),
    onSuccess: async (loan) => {
      await invalidateFinancialData(queryClient);
      setRepayFor(null);
      setDetail(loan);
      notify('Repayment recorded');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => loansApi.close(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setClosing(null);
      setDetail(null);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setFormError(null);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Loans & debts"
        subtitle="Money borrowed or lent, with repayments tracked separately from household expenses."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            Record loan
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatCard label="You owe (borrowed)" value={formatMoney(borrowedOutstanding, { symbol })} tone="negative" icon={<HandshakeRoundedIcon />} helper="Outstanding principal" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Owed to you (lent)" value={formatMoney(lentOutstanding, { symbol })} tone="positive" icon={<PaymentsRoundedIcon />} helper="Outstanding principal" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Net position" value={formatMoney(lentOutstanding - borrowedOutstanding, { symbol })} helper="Lent minus borrowed" />
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mb: 3 }}>
        Loan principal repayments are not consumption expenses. Record them here so spending reports stay accurate; use
        an expense only for the interest portion if you want it counted as a cost.
      </Alert>

      {isLoading ? (
        <LoadingBlock label="Loading loans…" />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? 'Unable to load loans'} onRetry={() => void refetch()} />
      ) : loans.length ? (
        <Grid container spacing={2}>
          {loans.map((loan) => (
            <Grid item xs={12} md={6} key={loan.id}>
              <Card sx={{ opacity: loan.status === 'closed' ? 0.7 : 1 }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
                    <Box>
                      <Typography variant="h6">{loan.counterparty}</Typography>
                      <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Chip size="small" variant="outlined" color={loan.direction === 'borrowed' ? 'error' : 'success'} label={loan.direction === 'borrowed' ? 'Borrowed' : 'Lent'} />
                        <Chip size="small" variant="outlined" label={loan.status === 'active' ? 'Active' : 'Closed'} color={loan.status === 'active' ? 'primary' : 'default'} />
                        {loan.is_overdue && <Chip size="small" color="error" label="Overdue" />}
                      </Stack>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary">Outstanding</Typography>
                      <MoneyText value={loan.outstanding_balance} symbol={symbol} variant="h6" display="block" tone={loan.outstanding_balance > 0 ? 'negative' : 'positive'} />
                    </Box>
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    Principal {formatMoney(loan.principal_amount, { symbol })} · repaid {formatMoney(loan.principal_repaid, { symbol })}
                    {loan.interest_rate ? ` · ${loan.interest_rate}% interest` : ''}
                    {loan.due_date ? ` · due ${formatDate(loan.due_date)}` : ''}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(loan.repayment_progress_percent, 100)}
                    color={loan.status === 'closed' ? 'success' : 'primary'}
                    sx={{ my: 1.5, backgroundColor: '#EDF1EE' }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PaymentsRoundedIcon />}
                      onClick={() => {
                        setRepayFor(loan);
                        setRepayment({
                          amount: '',
                          principal: '',
                          interest: '',
                          date: todayISO(),
                          account_id: loan.account_id ?? '',
                          notes: '',
                        });
                      }}
                      disabled={loan.status !== 'active'}
                    >
                      Add repayment
                    </Button>
                    <Button size="small" color="inherit" onClick={() => setDetail(loan)}>
                      History ({loan.repayments.length})
                    </Button>
                    {loan.status === 'active' && (
                      <Button size="small" color="error" onClick={() => setClosing(loan)}>
                        Close
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Card>
          <EmptyState
            title="No loans recorded"
            description="Track money borrowed from family or lent to friends, with interest and due dates."
            icon={<HandshakeRoundedIcon fontSize="inherit" />}
            action={<Button size="small" variant="contained" onClick={openCreate}>Record a loan</Button>}
          />
        </Card>
      )}

      <FormDialog
        open={dialogOpen}
        title="Record a loan"
        submitLabel="Save loan"
        loading={createMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => {
          setFormError(null);
          if (form.counterparty.trim().length < 2) {
            setFormError('Enter the counterparty name.');
            return;
          }
          if (!Number(form.principal_amount) || Number(form.principal_amount) <= 0) {
            setFormError('Principal amount must be greater than zero.');
            return;
          }
          if (form.due_date && form.due_date < form.start_date) {
            setFormError('Due date must be on or after the start date.');
            return;
          }
          createMutation.mutate();
        }}
      >
        {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Direction" value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as 'borrowed' | 'lent' })}>
              <MenuItem value="borrowed">I borrowed money</MenuItem>
              <MenuItem value="lent">I lent money</MenuItem>
            </TextField>
            <TextField label="Counterparty" value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} placeholder="e.g. Uncle Verma / HDFC Bank" required />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Principal (₹)" type="number" value={form.principal_amount} onChange={(event) => setForm({ ...form, principal_amount: event.target.value })} inputProps={{ min: 1, step: '0.01' }} required />
            <TextField label="Interest rate % (optional)" type="number" value={form.interest_rate} onChange={(event) => setForm({ ...form, interest_rate: event.target.value })} inputProps={{ min: 0, step: '0.01' }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Start date" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Due date (optional)" type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField select label="Linked account (optional)" value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })}>
            <MenuItem value="">Not linked</MenuItem>
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} multiline minRows={2} />
        </Stack>
      </FormDialog>

      <FormDialog
        open={Boolean(repayFor)}
        title={`Repayment for ${repayFor?.counterparty ?? ''}`}
        description={`Outstanding principal: ${formatMoney(repayFor?.outstanding_balance ?? 0, { symbol })}`}
        submitLabel="Record repayment"
        loading={repayMutation.isPending}
        onClose={() => setRepayFor(null)}
        onSubmit={() => {
          if (!Number(repayment.amount) || Number(repayment.amount) <= 0) {
            notify('Enter a repayment amount', 'error');
            return;
          }
          const principal = repayment.principal ? Number(repayment.principal) : Number(repayment.amount);
          const interest = repayment.interest ? Number(repayment.interest) : 0;
          if (Math.abs(principal + interest - Number(repayment.amount)) > 0.001) {
            notify('Principal and interest must add up to the repayment amount', 'error');
            return;
          }
          repayMutation.mutate();
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Total repaid (₹)" type="number" value={repayment.amount} onChange={(event) => setRepayment({ ...repayment, amount: event.target.value })} inputProps={{ min: 0.01, step: '0.01' }} autoFocus />
            <TextField label="Date" type="date" value={repayment.date} onChange={(event) => setRepayment({ ...repayment, date: event.target.value })} InputLabelProps={{ shrink: true }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Principal component"
              type="number"
              value={repayment.principal}
              onChange={(event) => {
                const principal = event.target.value;
                const interest = repayment.interest ? Number(repayment.interest) : 0;
                const amount = principal ? Number(principal) + interest : '';
                setRepayment({ ...repayment, principal, amount: amount === '' ? '' : String(amount) });
              }}
              helperText="Defaults to the full amount"
            />
            <TextField
              label="Interest component"
              type="number"
              value={repayment.interest}
              onChange={(event) => {
                const interest = event.target.value;
                const principal = repayment.principal ? Number(repayment.principal) : 0;
                const amount = interest ? Number(interest) + principal : '';
                setRepayment({ ...repayment, interest, amount: amount === '' ? '' : String(amount) });
              }}
            />
          </Stack>
          <TextField select label="Paid from account (optional)" value={repayment.account_id} onChange={(event) => setRepayment({ ...repayment, account_id: event.target.value })}>
            <MenuItem value="">Not specified</MenuItem>
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Notes" value={repayment.notes} onChange={(event) => setRepayment({ ...repayment, notes: event.target.value })} />
        </Stack>
      </FormDialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        {detail && (
          <>
            <DialogTitle>
              {detail.counterparty}
              <Typography variant="caption" color="text.secondary" display="block">
                {detail.direction === 'borrowed' ? 'Borrowed' : 'Lent'} · {formatPercent(detail.repayment_progress_percent)} repaid
              </Typography>
            </DialogTitle>
            <DialogContent>
              {detail.repayments.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Principal</TableCell>
                      <TableCell align="right">Interest</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>By</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...detail.repayments].reverse().map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.repayment_date)}</TableCell>
                        <TableCell align="right">{formatMoney(item.principal_component, { symbol })}</TableCell>
                        <TableCell align="right">{formatMoney(item.interest_component, { symbol })}</TableCell>
                        <TableCell align="right">
                          <MoneyText value={item.amount} symbol={symbol} variant="body2" fontWeight={600} />
                        </TableCell>
                        <TableCell>{item.created_by_name ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No repayments recorded yet.
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
        open={Boolean(closing)}
        title="Close this loan?"
        description="Mark the loan as settled. Repayment history stays intact and can still be reviewed."
        confirmLabel="Close loan"
        loading={closeMutation.isPending}
        onClose={() => setClosing(null)}
        onConfirm={() => closing && closeMutation.mutate(closing.id)}
      />
    </>
  );
}
