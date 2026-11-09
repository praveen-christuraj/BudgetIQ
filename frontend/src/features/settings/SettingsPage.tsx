import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BackupRoundedIcon from '@mui/icons-material/BackupRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingBlock } from '@/components/common/StateBlocks';
import { authApi, settingsApi } from '@/services/endpoints';
import { invalidateFinancialData } from '@/utils/invalidate';

const TABS = [
  { key: 'household', label: 'Household' },
  { key: 'preferences', label: 'Budget & alerts' },
  { key: 'security', label: 'Security' },
  { key: 'system', label: 'System & backup' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function SettingsPage() {
  const { isAdmin, context } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const [tab, setTab] = useState<TabKey>(tabParam && TABS.some((item) => item.key === tabParam) ? tabParam : 'household');

  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const { data: household } = useQuery({ queryKey: ['settings', 'household'], queryFn: settingsApi.household });
  const { data: system } = useQuery({ queryKey: ['settings', 'system'], queryFn: settingsApi.system });

  const [householdName, setHouseholdName] = useState('');
  const [form, setForm] = useState({
    currency_symbol: '₹',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    date_format: 'DD-MM-YYYY',
    fiscal_year_start_month: 4,
    budget_warning_threshold: 80,
    budget_critical_threshold: 100,
    notification_lead_days: 7,
    backup_retention_days: 30,
  });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (household) setHouseholdName(household.name);
  }, [household]);

  useEffect(() => {
    if (settings) {
      setForm({
        currency_symbol: settings.currency_symbol,
        currency: settings.currency,
        timezone: settings.timezone,
        date_format: settings.date_format,
        fiscal_year_start_month: settings.fiscal_year_start_month,
        budget_warning_threshold: settings.budget_warning_threshold,
        budget_critical_threshold: settings.budget_critical_threshold,
        notification_lead_days: settings.notification_lead_days,
        backup_retention_days: settings.backup_retention_days,
      });
    }
  }, [settings]);

  const renameMutation = useMutation({
    mutationFn: () => settingsApi.renameHousehold(householdName.trim()),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      notify('Household name updated');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const settingsMutation = useMutation({
    mutationFn: () => settingsApi.update(form),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      notify('Settings saved');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      authApi.changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      }),
    onSuccess: () => {
      setPasswords({ current_password: '', new_password: '', confirm: '' });
      setPasswordError(null);
      notify('Password updated');
    },
    onError: (err: Error) => setPasswordError(err.message),
  });

  const changeTab = (next: TabKey) => {
    setTab(next);
    if (next === 'household') {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ tab: next });
    }
  };

  if (isLoading) return <LoadingBlock label="Loading settings…" minHeight={320} />;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Household configuration, budget thresholds, security and system information."
        actions={
          <Chip
            label={isAdmin ? 'Administrator access' : 'Member — read-only settings'}
            color={isAdmin ? 'primary' : 'default'}
            variant="outlined"
            icon={<LockRoundedIcon />}
          />
        }
      />

      <Card sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_event, value: TabKey) => changeTab(value)} variant="scrollable" sx={{ px: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          {TABS.map((item) => (
            <Tab key={item.key} value={item.key} label={item.label} />
          ))}
        </Tabs>
      </Card>

      {tab === 'household' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>Household profile</Typography>
                <Stack spacing={2}>
                  <TextField label="Household name" value={householdName} onChange={(event) => setHouseholdName(event.target.value)} disabled={!isAdmin} />
                  <TextField label="Your name" value={context?.user.full_name ?? ''} disabled />
                  <TextField label="Your role" value={context?.role === 'admin' ? 'Administrator' : 'Member'} disabled />
                  {isAdmin && (
                    <Box>
                      <Button variant="contained" onClick={() => renameMutation.mutate()} disabled={renameMutation.isPending}>
                        Save household name
                      </Button>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>Household rules</Typography>
                <Stack spacing={1.75}>
                  {[
                    ['Financial model', 'Hybrid — shared household + personal member finances'],
                    ['Default currency', `${settings?.currency ?? 'INR'} (${settings?.currency_symbol ?? '₹'})`],
                    ['Money precision', '2 decimal places, Decimal arithmetic only'],
                    ['Member access', 'Everyone can record transactions'],
                    ['Administrator', 'Manages members, accounts, categories, budgets, settings'],
                    ['Registration', 'Disabled — the administrator creates members'],
                    ['Approvals', 'Not required'],
                    ['Audit', 'Every financial change is recorded'],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={600}>{value}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 'preferences' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 0.5 }}>Budget warnings & alerts</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                  Thresholds drive dashboard colours and notifications. The warning must be below the critical level.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Warning threshold %"
                      type="number"
                      value={form.budget_warning_threshold}
                      onChange={(event) => setForm({ ...form, budget_warning_threshold: Number(event.target.value) })}
                      disabled={!isAdmin}
                      inputProps={{ min: 1, max: 100 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Critical threshold %"
                      type="number"
                      value={form.budget_critical_threshold}
                      onChange={(event) => setForm({ ...form, budget_critical_threshold: Number(event.target.value) })}
                      disabled={!isAdmin}
                      inputProps={{ min: 50, max: 200 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Notify payment lead time (days)"
                      type="number"
                      value={form.notification_lead_days}
                      onChange={(event) => setForm({ ...form, notification_lead_days: Number(event.target.value) })}
                      disabled={!isAdmin}
                      inputProps={{ min: 1, max: 60 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Currency"
                      value={`${form.currency} (${form.currency_symbol})`}
                      disabled
                      helperText="INR is the confirmed default for version 1.0"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="Fiscal year starts"
                      value={form.fiscal_year_start_month}
                      onChange={(event) => setForm({ ...form, fiscal_year_start_month: Number(event.target.value) })}
                      disabled={!isAdmin}
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                        <MenuItem key={month} value={index + 1}>{month}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} disabled={!isAdmin} />
                  </Grid>
                </Grid>
                {isAdmin && (
                  <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
                    <Button variant="contained" onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
                      Save preferences
                    </Button>
                  </Stack>
                )}
                {!isAdmin && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Only the administrator can change household preferences.
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>How thresholds behave</Typography>
                <Stack spacing={2}>
                  <Box>
                    <Chip size="small" color="success" label="On track" />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      Spending below {form.budget_warning_threshold}% of the planned amount.
                    </Typography>
                  </Box>
                  <Box>
                    <Chip size="small" color="warning" label="Near limit" />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      At or above {form.budget_warning_threshold}% — a warning notification is created.
                    </Typography>
                  </Box>
                  <Box>
                    <Chip size="small" color="error" label="Over budget" />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      At or above {form.budget_critical_threshold}% — the household sees a critical alert.
                    </Typography>
                  </Box>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">
                    Alerts are de-duplicated per budget and period, so they do not repeat on every dashboard visit.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 'security' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 0.5 }}>Change password</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                  Passwords are hashed with Argon2. Sessions use short-lived JWT access tokens with refresh rotation.
                </Typography>
                {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}
                <Stack spacing={2}>
                  <TextField
                    label="Current password"
                    type="password"
                    value={passwords.current_password}
                    onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}
                  />
                  <TextField
                    label="New password"
                    type="password"
                    value={passwords.new_password}
                    onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}
                    helperText="At least 8 characters, mixing letters and numbers."
                  />
                  <TextField
                    label="Confirm new password"
                    type="password"
                    value={passwords.confirm}
                    onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                  />
                  <Box>
                    <Button
                      variant="contained"
                      onClick={() => {
                        setPasswordError(null);
                        if (passwords.new_password.length < 8) {
                          setPasswordError('New password must be at least 8 characters.');
                          return;
                        }
                        if (passwords.new_password !== passwords.confirm) {
                          setPasswordError('New passwords do not match.');
                          return;
                        }
                        passwordMutation.mutate();
                      }}
                      disabled={passwordMutation.isPending || !passwords.current_password}
                    >
                      Update password
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ mb: 2 }}>Security posture</Typography>
                <Stack spacing={1.75}>
                  {[
                    ['Password hashing', 'Argon2id'],
                    ['Session tokens', `JWT access (${system?.session_minutes ?? 30} min) + refresh (${system?.refresh_days ?? 7} days)`],
                    ['Brute-force protection', 'Account lockout after repeated failures'],
                    ['Authorisation', 'Enforced in FastAPI for every endpoint'],
                    ['Household isolation', 'Household-scoped queries, never trust browser IDs'],
                    ['Public registration', 'Disabled'],
                    ['Secrets', 'Environment variables only, never in Git'],
                    ['Network', 'PostgreSQL internal-only, LAN access via reverse proxy'],
                  ].map(([label, value]) => (
                    <Stack key={label} direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={600} textAlign="right">{value}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 'system' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <StorageRoundedIcon color="primary" />
                  <Typography variant="h5">System information</Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {[
                    ['Application', system?.app_name ?? 'Family Finance Manager'],
                    ['Version', system?.version ?? '1.0.0'],
                    ['Environment', system?.environment ?? '—'],
                    ['Database', system?.database ?? '—'],
                    ['Max receipt size', `${system?.max_upload_mb ?? 10} MB`],
                    ['Allowed receipts', (system?.allowed_upload_types ?? []).join(', ')],
                    ['Timezone', system?.timezone ?? 'Asia/Kolkata'],
                  ].map(([label, value]) => (
                    <Stack key={label} direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={600} textAlign="right">{value}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <BackupRoundedIcon color="primary" />
                  <Typography variant="h5">Backups</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  The Docker Compose stack includes a backup service that dumps PostgreSQL daily, archives receipts
                  weekly and prunes old copies.
                </Typography>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Retention (days)</Typography>
                    <Typography variant="body2" fontWeight={600}>{form.backup_retention_days}</Typography>
                  </Box>
                  <Alert severity="warning">
                    Never run <code>docker compose down -v</code> on a live household. It deletes the database volume.
                  </Alert>
                  <Box component="pre" sx={{ fontSize: '0.72rem', backgroundColor: '#F7F9F8', p: 1.5, borderRadius: 1.5, overflowX: 'auto', m: 0 }}>
{`# Manual backup
./backups/backup.sh

# Restore (test first!)
docker compose stop api web
gunzip -c backups/db/<file>.sql.gz | \\
  docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
docker compose start api web`}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Full procedures live in <code>docs/DOCKER_DEPLOYMENT_GUIDE.md</code> and <code>backups/README.md</code>.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <SavingsRoundedIcon color="primary" />
                  <Typography variant="h5">Financial integrity rules</Typography>
                </Stack>
                <Grid container spacing={2}>
                  {[
                    ['Amounts', 'NUMERIC(18,2) + Decimal arithmetic, never floating point'],
                    ['Balances', 'Derived from opening balance and posted entries only'],
                    ['Transfers', 'Move money between accounts, never income or expense'],
                    ['Scope', 'Shared/personal is independent of account ownership'],
                    ['Reversal', 'Soft deletes restore balances automatically'],
                    ['Savings', 'Goal contributions are tracked separately from expenses'],
                    ['Loans', 'Principal repayments are not household consumption'],
                  ].map(([title, description]) => (
                    <Grid item xs={12} sm={6} md={4} key={title}>
                      <Typography variant="subtitle2">{title}</Typography>
                      <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </>
  );
}
