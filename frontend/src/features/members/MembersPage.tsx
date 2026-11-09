import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import PersonOffRoundedIcon from '@mui/icons-material/PersonOffRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { membersApi, settingsApi } from '@/services/endpoints';
import type { Member } from '@/types';
import { formatDate, formatMoney, initials } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';

interface MemberForm {
  full_name: string;
  email: string;
  password: string;
  role: 'admin' | 'member';
  relationship_label: string;
  display_color: string;
}

const emptyForm: MemberForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'member',
  relationship_label: '',
  display_color: '#1976D2',
};

const RELATIONSHIPS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'];

export function MembersPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Member | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const { data: members = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const totalIncome = members.reduce((sum, member) => sum + member.total_income, 0);
  const totalExpenses = members.reduce((sum, member) => sum + member.total_expenses, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return membersApi.update(editing.id, {
          full_name: form.full_name,
          role: form.role,
          relationship_label: form.relationship_label || null,
          display_color: form.display_color,
        });
      }
      return membersApi.create({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        relationship_label: form.relationship_label || null,
        display_color: form.display_color,
      });
    },
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setEditing(null);
      notify(editing ? 'Member updated' : 'Family member added');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => membersApi.deactivate(id),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDeactivating(null);
      notify('Member deactivated. Their history is preserved.');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: () => membersApi.resetPassword(resetting!.id, newPassword),
    onSuccess: async () => {
      setResetting(null);
      setNewPassword('');
      notify('Password reset successfully');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (member: Member) => {
    setEditing(member);
    setForm({
      full_name: member.full_name,
      email: member.email,
      password: '',
      role: member.role,
      relationship_label: member.relationship_label ?? '',
      display_color: member.display_color,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const submit = () => {
    setFormError(null);
    if (form.full_name.trim().length < 2) {
      setFormError('Full name is required.');
      return;
    }
    if (!editing) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        setFormError('Enter a valid email address.');
        return;
      }
      if (form.password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
    }
    saveMutation.mutate();
  };

  return (
    <>
      <PageHeader
        title="Family members"
        subtitle="Everyone can record transactions. Only administrators manage members and household settings."
        actions={
          isAdmin && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
              Add member
            </Button>
          )
        }
      />

      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 3 }}>
          You can see the family member list and shared activity. Personal transactions stay private to their owner and
          the administrator.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatCard label="Household members" value={String(members.filter((m) => m.is_active).length)} icon={<GroupRoundedIcon />} helper={`${members.filter((m) => m.role === 'admin').length} administrator(s)`} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Income this month" value={formatMoney(totalIncome, { symbol })} tone="positive" helper="Across all members" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard label="Expenses this month" value={formatMoney(totalExpenses, { symbol })} tone="negative" helper="Shared and personal records" />
        </Grid>
      </Grid>

      {isLoading ? (
        <LoadingBlock label="Loading family members…" />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? 'Unable to load members'} onRetry={() => void refetch()} />
      ) : members.length ? (
        <Grid container spacing={2}>
          {members.map((member) => (
            <Grid item xs={12} sm={6} lg={4} key={member.id}>
              <Card sx={{ height: '100%', opacity: member.is_active ? 1 : 0.65 }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                    <Avatar sx={{ bgcolor: member.display_color, width: 46, height: 46, fontWeight: 700 }}>
                      {initials(member.full_name)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="h6" noWrap>
                          {member.full_name}
                        </Typography>
                        {member.role === 'admin' && <ShieldRoundedIcon fontSize="small" color="primary" />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {member.email}
                      </Typography>
                    </Box>
                    {isAdmin && member.is_active && (
                      <Stack direction="row">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(member)} aria-label="Edit member">
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset password">
                          <IconButton
                            size="small"
                            aria-label="Reset password"
                            onClick={() => {
                              setResetting(member);
                              setNewPassword('');
                            }}
                          >
                            <KeyRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {member.user_id !== context?.user.id && (
                          <Tooltip title="Deactivate">
                            <IconButton size="small" color="error" aria-label="Deactivate" onClick={() => setDeactivating(member)}>
                              <PersonOffRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    )}
                  </Stack>

                  <Stack direction="row" spacing={0.75} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={member.role === 'admin' ? 'Administrator' : 'Member'} color={member.role === 'admin' ? 'primary' : 'default'} variant="outlined" />
                    {member.relationship_label && <Chip size="small" label={member.relationship_label} variant="outlined" />}
                    {!member.is_active && <Chip size="small" label="Inactive" color="error" variant="outlined" />}
                  </Stack>

                  <Divider />
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Income this month</Typography>
                      <MoneyText value={member.total_income} symbol={symbol} variant="body2" tone="positive" fontWeight={600} display="block" />
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary">Expenses this month</Typography>
                      <MoneyText value={member.total_expenses} symbol={symbol} variant="body2" tone="negative" fontWeight={600} display="block" />
                    </Box>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {member.transaction_count} transaction(s) · {member.account_count} account(s)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Joined {formatDate(member.joined_at)}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <EmptyState title="No members yet" description="Add family members so they can sign in and record transactions." />
      )}

      <FormDialog
        open={dialogOpen}
        title={editing ? `Edit ${editing.full_name}` : 'Add a family member'}
        description={
          editing
            ? 'Only administrators can change roles. At least one active administrator must remain.'
            : 'The member signs in with this email and password. Public registration stays disabled.'
        }
        submitLabel={editing ? 'Save changes' : 'Create member'}
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
          <TextField label="Full name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
          <TextField
            label="Email address"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            disabled={Boolean(editing)}
            required
          />
          {!editing && (
            <TextField
              label="Temporary password"
              type="text"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              helperText="At least 8 characters, mixing letters and numbers. The member can change it later."
              required
            />
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'admin' | 'member' })}>
              <MenuItem value="member">Member</MenuItem>
              <MenuItem value="admin">Administrator</MenuItem>
            </TextField>
            <TextField select label="Relationship" value={form.relationship_label} onChange={(event) => setForm({ ...form, relationship_label: event.target.value })}>
              <MenuItem value="">Not specified</MenuItem>
              {RELATIONSHIPS.map((relationship) => (
                <MenuItem key={relationship} value={relationship}>
                  {relationship}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Member colour"
            type="color"
            value={form.display_color}
            onChange={(event) => setForm({ ...form, display_color: event.target.value })}
            helperText="Used in charts and avatars."
            sx={{ maxWidth: 180 }}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deactivating)}
        title="Deactivate this member?"
        description={
          deactivating
            ? `${deactivating.full_name} will no longer be able to sign in. Their accounts, transactions and history stay intact for reporting.`
            : ''
        }
        confirmLabel="Deactivate member"
        tone="error"
        loading={deactivateMutation.isPending}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && deactivateMutation.mutate(deactivating.id)}
      />

      <FormDialog
        open={Boolean(resetting)}
        title={`Reset password for ${resetting?.full_name ?? ''}`}
        submitLabel="Reset password"
        loading={resetMutation.isPending}
        onClose={() => {
          setResetting(null);
          setNewPassword('');
        }}
        onSubmit={() => {
          if (newPassword.length < 8) {
            notify('Password must be at least 8 characters', 'error');
            return;
          }
          resetMutation.mutate();
        }}
      >
        <TextField label="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} helperText="The member should change this after signing in." />
      </FormDialog>
    </>
  );
}
