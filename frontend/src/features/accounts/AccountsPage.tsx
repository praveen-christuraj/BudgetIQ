import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import WalletRoundedIcon from '@mui/icons-material/WalletRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { accountsApi, membersApi, settingsApi } from '@/services/endpoints';
import type { Account, AccountType, Member } from '@/types';
import { formatMoney } from '@/utils/format';
import { ACCOUNT_TYPE_LABEL } from '@/utils/status';
import { invalidateFinancialData } from '@/utils/invalidate';

const ACCOUNT_TYPES: AccountType[] = ['cash', 'savings', 'current', 'credit_card', 'fixed_deposit', 'investment', 'other'];

interface AccountForm {
  name: string;
  account_type: AccountType;
  owner_user_id: string;
  institution: string;
  account_number_last4: string;
  opening_balance: string;
  notes: string;
}

const emptyForm = (owner: string): AccountForm => ({
  name: '',
  account_type: 'savings',
  owner_user_id: owner,
  institution: '',
  account_number_last4: '',
  opening_balance: '0',
  notes: '',
});

function accountIcon(type: AccountType) {
  if (type === 'credit_card') return <CreditCardRoundedIcon fontSize="small" />;
  if (type === 'cash') return <WalletRoundedIcon fontSize="small" />;
  if (type === 'savings' || type === 'fixed_deposit') return <SavingsRoundedIcon fontSize="small" />;
  return <AccountBalanceRoundedIcon fontSize="small" />;
}

export function AccountsPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm(''));
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Account | null>(null);

  const { data: accounts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => accountsApi.list(true),
  });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const shared = accounts.filter((account) => account.is_shared);
  const personal = accounts.filter((account) => !account.is_shared);
  const sharedTotal = shared.filter((a) => a.is_active).reduce((sum, account) => sum + account.current_balance, 0);
  const personalTotal = personal.filter((a) => a.is_active).reduce((sum, account) => sum + account.current_balance, 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        account_type: form.account_type,
        owner_user_id: form.owner_user_id || null,
        institution: form.institution.trim() || null,
        account_number_last4: form.account_number_last4.trim() || null,
        opening_balance: Number(form.opening_balance || 0),
        notes: form.notes.trim() || null,
      };
      return editing ? accountsApi.update(editing.id, payload) : accountsApi.create(payload);
    },
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setEditing(null);
      notify(editing ? 'Account updated' : 'Account created');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsApi.remove(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setDeactivating(null);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(isAdmin ? '' : context?.user.id ?? ''));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setForm({
      name: account.name,
      account_type: account.account_type,
      owner_user_id: account.owner_user_id ?? '',
      institution: account.institution ?? '',
      account_number_last4: account.account_number_last4 ?? '',
      opening_balance: String(account.opening_balance),
      notes: account.notes ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const submit = () => {
    setFormError(null);
    if (form.name.trim().length < 2) {
      setFormError('Give the account a name.');
      return;
    }
    if (!Number.isFinite(Number(form.opening_balance))) {
      setFormError('Opening balance must be a number.');
      return;
    }
    if (!isAdmin && form.owner_user_id !== context?.user.id) {
      setFormError('Members can only create personal accounts for themselves.');
      return;
    }
    saveMutation.mutate();
  };

  const renderAccount = (account: Account) => (
    <Grid item xs={12} sm={6} lg={4} key={account.id}>
      <Card sx={{ height: '100%', opacity: account.is_active ? 1 : 0.6 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 2 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                backgroundColor: account.is_shared ? 'rgba(27,94,32,0.1)' : 'rgba(2,119,135,0.1)',
                color: account.is_shared ? 'primary.main' : 'secondary.main',
                flexShrink: 0,
              }}
            >
              {accountIcon(account.account_type)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" noWrap>
                {account.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {ACCOUNT_TYPE_LABEL[account.account_type]}
                {account.institution ? ` · ${account.institution}` : ''}
                {account.account_number_last4 ? ` · ••${account.account_number_last4}` : ''}
              </Typography>
            </Box>
            <Stack direction="row">
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => openEdit(account)} aria-label="Edit account">
                  <EditRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Deactivate">
                <IconButton size="small" color="error" onClick={() => setDeactivating(account)} aria-label="Deactivate account">
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {account.account_type === 'credit_card' ? 'Outstanding (negative = owed)' : 'Current balance'}
          </Typography>
          <MoneyText
            value={account.current_balance}
            symbol={symbol}
            variant="h2"
            display="block"
            sx={{ fontSize: '1.5rem' }}
            tone={account.current_balance < 0 ? 'negative' : 'default'}
          />
          <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={account.is_shared ? 'Shared household' : account.owner_name ?? 'Personal'} color={account.is_shared ? 'primary' : 'secondary'} />
            {!account.is_active && <Chip size="small" variant="outlined" color="error" label="Inactive" />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            Opening balance {formatMoney(account.opening_balance, { symbol })}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Cash, bank, savings and credit accounts — shared by the household or owned by a member."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
            Add account
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatCard label="Shared account balance" value={formatMoney(sharedTotal, { symbol })} icon={<AccountBalanceRoundedIcon />} helper={`${shared.filter((a) => a.is_active).length} active account(s)`} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Personal account balance" value={formatMoney(personalTotal, { symbol })} icon={<WalletRoundedIcon />} helper={`${personal.filter((a) => a.is_active).length} active account(s)`} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Combined balance" value={formatMoney(sharedTotal + personalTotal, { symbol })} icon={<SavingsRoundedIcon />} helper="All accounts you can see" />
        </Grid>
      </Grid>

      {isLoading ? (
        <LoadingBlock label="Loading accounts…" />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? 'Unable to load accounts'} onRetry={() => void refetch()} />
      ) : (
        <>
          <Typography variant="h4" sx={{ mb: 1.5 }}>
            Shared household accounts
          </Typography>
          {shared.length ? (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {shared.map(renderAccount)}
            </Grid>
          ) : (
            <Card sx={{ mb: 3 }}>
              <EmptyState title="No shared accounts yet" description="Add a shared bank or cash account so all members can record household transactions." />
            </Card>
          )}

          <Typography variant="h4" sx={{ mb: 1.5 }}>
            Member accounts
          </Typography>
          {personal.length ? (
            <Grid container spacing={2}>{personal.map(renderAccount)}</Grid>
          ) : (
            <Card>
              <EmptyState title="No personal accounts" description="Members can add their own savings, cash or credit card accounts." />
            </Card>
          )}
        </>
      )}

      <FormDialog
        open={dialogOpen}
        title={editing ? `Edit ${editing.name}` : 'Add an account'}
        description="Balances are always derived from the opening balance plus posted entries."
        loading={saveMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
      >
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Stack spacing={2}>
          <TextField label="Account name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Account type" value={form.account_type} onChange={(event) => setForm({ ...form, account_type: event.target.value as AccountType })}>
              {ACCOUNT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {ACCOUNT_TYPE_LABEL[type]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Owner"
              value={form.owner_user_id}
              onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}
              disabled={!isAdmin}
              helperText={form.owner_user_id ? 'Personal account' : 'Shared household account'}
            >
              {isAdmin && <MenuItem value="">Shared household</MenuItem>}
              {members.map((member: Member) => (
                <MenuItem key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Institution / bank" value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
            <TextField label="Last 4 digits" value={form.account_number_last4} onChange={(event) => setForm({ ...form, account_number_last4: event.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </Stack>
          <TextField
            label="Opening balance (₹)"
            type="number"
            value={form.opening_balance}
            onChange={(event) => setForm({ ...form, opening_balance: event.target.value })}
            helperText="Use a negative value for credit card dues."
          />
          <TextField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} multiline minRows={2} />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deactivating)}
        title="Remove this account?"
        description={
          deactivating
            ? `"${deactivating.name}" will be deactivated if it has transactions (history is preserved), otherwise deleted.`
            : ''
        }
        confirmLabel="Remove account"
        tone="error"
        loading={deleteMutation.isPending}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && deleteMutation.mutate(deactivating.id)}
      />

    </>
  );
}
