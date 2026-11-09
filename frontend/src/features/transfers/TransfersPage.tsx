import {
  Alert,
  Button,
  Card,
  Grid,
  IconButton,
  MenuItem,
  Stack,
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
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { accountsApi, settingsApi, transfersApi } from '@/services/endpoints';
import type { Transfer } from '@/types';
import { formatDate, formatMoney, todayISO } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';

export function TransfersPage() {
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<Transfer | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'all'], queryFn: () => accountsApi.list(false) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';
  const { data: transfers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => transfersApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      transfersApi.create({
        from_account_id: fromAccount,
        to_account_id: toAccount,
        amount: Number(amount),
        transfer_date: date,
        description: description.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setAmount('');
      setDescription('');
      notify('Transfer completed. Balances updated on both accounts.');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => transfersApi.reverse(id, reason),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setReversing(null);
      notify('Transfer reversed. Both balances restored.');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  return (
    <>
      <PageHeader
        title="Transfers"
        subtitle="Move money between accounts. Transfers never count as income or expenses."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => {
            setFormError(null);
            setFromAccount(accounts[0]?.id ?? '');
            setToAccount(accounts[1]?.id ?? '');
            setDialogOpen(true);
          }}>
            New transfer
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 3 }}>
        A transfer only changes account balances. To record money saved towards a goal, add a savings contribution from
        the Savings Goals page.
      </Alert>

      <Card>
        {isLoading ? (
          <LoadingBlock label="Loading transfers…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load transfers'} onRetry={() => void refetch()} />
        ) : transfers.length ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>From</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(transfer.transfer_date)}</TableCell>
                    <TableCell>{transfer.from_account_name}</TableCell>
                    <TableCell>{transfer.to_account_name}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{transfer.description ?? '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        by {transfer.created_by_name ?? 'member'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <MoneyText value={transfer.amount} symbol={symbol} fontWeight={600} variant="body2" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color={transfer.status === 'posted' ? 'success.main' : 'error.main'} fontWeight={600}>
                        {transfer.status.toUpperCase()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {transfer.status === 'posted' && (
                        <Tooltip title="Reverse transfer">
                          <IconButton size="small" color="error" onClick={() => setReversing(transfer)} aria-label="Reverse transfer">
                            <UndoRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState
            title="No transfers yet"
            description="Move money between shared and personal accounts without affecting income or expenses."
            icon={<SwapHorizRoundedIcon fontSize="inherit" />}
            action={
              <Button size="small" variant="contained" onClick={() => setDialogOpen(true)}>
                Record a transfer
              </Button>
            }
          />
        )}
      </Card>

      <FormDialog
        open={dialogOpen}
        title="New transfer"
        description="Money leaves the source account and arrives in the destination account."
        submitLabel="Transfer"
        loading={createMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => {
          setFormError(null);
          if (!fromAccount || !toAccount) {
            setFormError('Choose both accounts.');
            return;
          }
          if (fromAccount === toAccount) {
            setFormError('Source and destination accounts must be different.');
            return;
          }
          if (!Number(amount) || Number(amount) <= 0) {
            setFormError('Enter an amount greater than zero.');
            return;
          }
          createMutation.mutate();
        }}
      >
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField select label="From account" value={fromAccount} onChange={(event) => setFromAccount(event.target.value)}>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name} · {formatMoney(account.current_balance, { symbol })}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="To account" value={toAccount} onChange={(event) => setToAccount(event.target.value)}>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Amount (₹)" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0.01, step: '0.01' }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <TextField label="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(reversing)}
        title="Reverse this transfer?"
        description={
          reversing
            ? `The transfer of ${formatMoney(reversing.amount, { symbol })} from ${reversing.from_account_name} to ${reversing.to_account_name} will be marked reversed and both balances restored.`
            : ''
        }
        confirmLabel="Reverse transfer"
        tone="error"
        requireReason
        loading={reverseMutation.isPending}
        onClose={() => setReversing(null)}
        onConfirm={(reason) => reversing && reverseMutation.mutate({ id: reversing.id, reason })}
      />
    </>
  );
}
