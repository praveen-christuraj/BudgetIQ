import {
  Alert,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { FormDialog } from '@/components/common/FormDialog';
import type { Account, Category, Member, Transaction } from '@/types';
import { PAYMENT_METHODS } from '@/utils/status';
import { todayISO } from '@/utils/format';

export interface TransactionFormValues {
  transaction_type: 'income' | 'expense';
  scope: 'shared' | 'personal';
  amount: number;
  transaction_date: string;
  description: string;
  account_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  owner_user_id: string | null;
  payment_method: string;
  status: 'posted' | 'draft';
  notes: string | null;
}

interface TransactionDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  defaultType: 'income' | 'expense';
  transaction?: Transaction | null;
  accounts: Account[];
  categories: Category[];
  members: Member[];
  isAdmin: boolean;
  currentUserId?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => void;
}

export function TransactionDialog({
  open,
  mode,
  defaultType,
  transaction,
  accounts,
  categories,
  members,
  isAdmin,
  currentUserId,
  loading,
  onClose,
  onSubmit,
}: TransactionDialogProps) {
  const [type, setType] = useState<'income' | 'expense'>(defaultType);
  const [scope, setScope] = useState<'shared' | 'personal'>('shared');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [status, setStatus] = useState<'posted' | 'draft'>('posted');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.transaction_type);
      setScope(transaction.scope);
      setAmount(String(transaction.amount));
      setDate(transaction.transaction_date);
      setDescription(transaction.description);
      setAccountId(transaction.account_id);
      setCategoryId(transaction.category_id ?? '');
      setSubcategoryId(transaction.subcategory_id ?? '');
      setOwnerId(transaction.owner_user_id ?? '');
      setPaymentMethod(transaction.payment_method);
      setStatus(transaction.status === 'draft' ? 'draft' : 'posted');
      setNotes(transaction.notes ?? '');
    } else {
      setType(defaultType);
      setScope('shared');
      setAmount('');
      setDate(todayISO());
      setDescription('');
      setAccountId(accounts.find((account) => account.is_active)?.id ?? '');
      setCategoryId('');
      setSubcategoryId('');
      setOwnerId('');
      setPaymentMethod(type === 'income' ? 'bank_transfer' : 'upi');
      setStatus('posted');
      setNotes('');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, defaultType]);

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.kind === type && category.is_active),
    [categories, type],
  );
  const selectedCategory = filteredCategories.find((category) => category.id === categoryId);
  const personalAccounts = accounts.filter((account) => account.is_active);

  const handleTypeChange = (next: 'income' | 'expense') => {
    setType(next);
    setCategoryId('');
    setSubcategoryId('');
  };

  const submit = () => {
    setError(null);
    const numericAmount = Number(amount);
    if (!description.trim() || description.trim().length < 2) {
      setError('Please enter a short description.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!accountId) {
      setError('Please choose the account used for this transaction.');
      return;
    }
    if (scope === 'personal' && isAdmin && !ownerId && mode === 'create') {
      setError('Choose which family member owns this personal transaction.');
      return;
    }
    onSubmit({
      transaction_type: type,
      scope,
      amount: Math.round(numericAmount * 100) / 100,
      transaction_date: date,
      description: description.trim(),
      account_id: accountId,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
      owner_user_id: scope === 'personal' ? (isAdmin ? ownerId || currentUserId || null : null) : null,
      payment_method: paymentMethod,
      status,
      notes: notes.trim() || null,
    });
  };

  return (
    <FormDialog
      open={open}
      title={mode === 'create' ? 'Record a transaction' : 'Edit transaction'}
      description={
        mode === 'create'
          ? 'Scope (shared or personal) is independent of which account paid the money.'
          : 'Every change is recorded in the audit history.'
      }
      submitLabel={mode === 'create' ? 'Save transaction' : 'Save changes'}
      loading={loading}
      onClose={onClose}
      onSubmit={submit}
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={2.25}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField select label="Type" value={type} onChange={(event) => handleTypeChange(event.target.value as 'income' | 'expense')} required>
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Amount (₹)"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputProps={{ min: 0.01, step: '0.01' }}
              required
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>
        </Grid>

        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={type === 'income' ? 'e.g. Monthly salary credited' : 'e.g. Weekly groceries at Big Bazaar'}
          required
          inputProps={{ maxLength: 255 }}
        />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField select label="Scope" value={scope} onChange={(event) => setScope(event.target.value as 'shared' | 'personal')}>
              <MenuItem value="shared">Shared household</MenuItem>
              <MenuItem value="personal">Personal</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Personal owner"
              value={scope === 'personal' ? ownerId || currentUserId || '' : ''}
              onChange={(event) => setOwnerId(event.target.value)}
              disabled={scope === 'shared' || !isAdmin}
              helperText={scope === 'shared' ? 'Owned by the household' : isAdmin ? 'Administrator can record on behalf of a member' : 'You are the owner'}
            >
              {members.map((member) => (
                <MenuItem key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField select label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              {personalAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name} {account.owner_name ? `· ${account.owner_name}` : '· Shared'}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {PAYMENT_METHODS.map((method) => (
                <MenuItem key={method} value={method}>
                  {method.replace('_', ' ').replace(/^\w/, (character) => character.toUpperCase())}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setSubcategoryId('');
              }}
            >
              <MenuItem value="">Uncategorised</MenuItem>
              {filteredCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Subcategory"
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
              disabled={!selectedCategory?.subcategories.length}
            >
              <MenuItem value="">None</MenuItem>
              {(selectedCategory?.subcategories ?? []).map((subcategory) => (
                <MenuItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        <Divider />
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={status === 'draft'}
                  onChange={(event) => setStatus(event.target.checked ? 'draft' : 'posted')}
                />
              }
              label={
                <Stack>
                  <Typography variant="body2">Save as draft</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Drafts never affect balances, budgets or reports.
                  </Typography>
                </Stack>
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              multiline
              minRows={2}
              inputProps={{ maxLength: 1000 }}
            />
          </Grid>
        </Grid>
      </Stack>
    </FormDialog>
  );
}
