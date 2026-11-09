import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ApiError } from '@/services/api';

const FEATURES = [
  {
    icon: <GroupsRoundedIcon fontSize="small" />,
    title: 'Shared and personal money, clearly separated',
    text: 'Everyone can record expenses; personal records stay private to their owner and the administrator.',
  },
  {
    icon: <AccountBalanceWalletRoundedIcon fontSize="small" />,
    title: 'Every account in one place',
    text: 'Cash, bank, savings, credit cards — with balances derived from posted entries only.',
  },
  {
    icon: <ShieldRoundedIcon fontSize="small" />,
    title: 'Private by design',
    text: 'Self-hosted on your home network. No cloud subscription, no third-party analytics.',
  },
];

export function AuthPage({ mode }: { mode: 'login' | 'setup' }) {
  const { login, setup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSetup = mode === 'setup';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isSetup) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setError('Password must contain both letters and numbers.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isSetup) {
        await setup({
          household_name: householdName.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        });
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' } }}>
      {/* Brand / information panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { md: 5, lg: 7 },
          color: '#F1F8F2',
          background: 'linear-gradient(160deg, #10441A 0%, #1B5E20 42%, #2E7D32 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 460,
            height: 460,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.12)',
            right: -160,
            top: -120,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.05)',
            left: -80,
            bottom: 40,
          }}
        />
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <SavingsRoundedIcon />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>Family Finance Manager</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>
              Private household ledger · INR
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ my: 5, position: 'relative' }}>
          <Typography variant="h1" sx={{ color: '#fff', fontSize: { md: '2.1rem', lg: '2.5rem' }, lineHeight: 1.15 }}>
            One clear picture of your family&apos;s money.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.8)', mt: 1.5, maxWidth: 460 }}>
            Track shared household spending and each member&apos;s personal finances, plan monthly
            budgets, and keep every receipt — all on your own home network.
          </Typography>

          <Stack spacing={2.5} sx={{ mt: 4 }}>
            {FEATURES.map((feature) => (
              <Stack key={feature.title} direction="row" spacing={1.5}>
                <Box
                  sx={{
                    mt: 0.25,
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.14)',
                    flexShrink: 0,
                  }}
                >
                  {feature.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{feature.title}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                    {feature.text}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          Self-hosted · PostgreSQL · Audit history on every financial change
        </Typography>
      </Box>

      {/* Form panel */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2.5, sm: 4, lg: 6 },
          backgroundColor: 'background.default',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 430 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3, display: { md: 'none' } }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: 'linear-gradient(135deg,#2E7D32,#0B3D12)',
              }}
            >
              <SavingsRoundedIcon fontSize="small" />
            </Box>
            <Typography fontWeight={700}>Family Finance Manager</Typography>
          </Stack>

          <Card>
            <CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                {isSetup ? <ShieldRoundedIcon color="primary" fontSize="small" /> : <LockRoundedIcon color="primary" fontSize="small" />}
                <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: '0.1em' }}>
                  {isSetup ? 'First-time setup' : 'Secure sign in'}
                </Typography>
              </Stack>
              <Typography variant="h2" sx={{ fontSize: '1.5rem' }}>
                {isSetup ? 'Create your household' : 'Welcome back'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>
                {isSetup
                  ? 'This account becomes the household administrator. Public registration stays disabled afterwards.'
                  : 'Sign in to review your family budget, expenses and savings.'}
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2.5 }}>
                  {error}
                </Alert>
              )}

              {isSetup && (
                <Alert severity="info" sx={{ mb: 2.5 }}>
                  Tip: use a strong passphrase you can share with your partner if they will also administer the household.
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={2.25}>
                  {isSetup && (
                    <>
                      <TextField
                        label="Household name"
                        value={householdName}
                        onChange={(event) => setHouseholdName(event.target.value)}
                        placeholder="e.g. Sharma Family"
                        required
                        autoFocus
                        inputProps={{ minLength: 2, maxLength: 150 }}
                      />
                      <TextField
                        label="Your full name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="e.g. Priya Sharma"
                        required
                        inputProps={{ minLength: 2, maxLength: 150 }}
                      />
                    </>
                  )}
                  <TextField
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    autoFocus={!isSetup}
                  />
                  <TextField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  {isSetup && (
                    <TextField
                      label="Confirm password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  )}

                  {!isSetup && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={remember}
                          onChange={(event) => setRemember(event.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Keep me signed in on this device</Typography>}
                    />
                  )}

                  <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ mt: 0.5 }}>
                    {submitting
                      ? isSetup
                        ? 'Creating household…'
                        : 'Signing in…'
                      : isSetup
                        ? 'Create household & sign in'
                        : 'Sign in'}
                  </Button>
                </Stack>
              </Box>

              <Divider sx={{ my: 3 }} />
              <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
                {isSetup ? (
                  <>Already set up? <Link component={RouterLink} to="/login" fontWeight={600}>Sign in</Link></>
                ) : (
                  <>New household? <Link component={RouterLink} to="/setup" fontWeight={600}>Run first-time setup</Link></>
                )}
              </Typography>
            </CardContent>
          </Card>

          <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 2.5 }}>
            Members are created by the household administrator. Public registration is disabled.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
