import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/app/providers/AuthContext';
import { EmptyState } from '@/components/common/StateBlocks';

import { AuthPage } from '@/features/auth/AuthPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MembersPage } from '@/features/members/MembersPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { BudgetsPage } from '@/features/budgets/BudgetsPage';
import { RecurringPage } from '@/features/recurring/RecurringPage';
import { SavingsPage } from '@/features/savings/SavingsPage';
import { LoansPage } from '@/features/loans/LoansPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

function Splash() {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: '100vh' }}>
      <Box sx={{ width: 46, height: 46, borderRadius: 2, background: 'linear-gradient(135deg,#2E7D32,#0B3D12)' }} />
      <CircularProgress size={24} />
      <Typography variant="caption" color="text.secondary">
        Loading your family finances…
      </Typography>
    </Stack>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Splash />;
  if (status === 'setup') return <Navigate to="/setup" replace />;
  if (status === 'unauthenticated') return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <EmptyState
        title="Administrator access required"
        description="Audit history is limited to the household administrator."
      />
    );
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <AuthPage mode="login" />
          </PublicOnly>
        }
      />
      <Route
        path="/setup"
        element={
          <PublicOnly>
            <AuthPage mode="setup" />
          </PublicOnly>
        }
      />

      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
      <Route path="/income" element={<RequireAuth><TransactionsPage kind="income" /></RequireAuth>} />
      <Route path="/expenses" element={<RequireAuth><TransactionsPage kind="expense" /></RequireAuth>} />
      <Route path="/transactions" element={<RequireAuth><TransactionsPage kind="all" /></RequireAuth>} />
      <Route path="/transfers" element={<RequireAuth><TransfersPage /></RequireAuth>} />
      <Route path="/categories" element={<RequireAuth><CategoriesPage /></RequireAuth>} />
      <Route path="/budgets" element={<RequireAuth><BudgetsPage /></RequireAuth>} />
      <Route path="/recurring" element={<RequireAuth><RecurringPage /></RequireAuth>} />
      <Route path="/savings" element={<RequireAuth><SavingsPage /></RequireAuth>} />
      <Route path="/loans" element={<RequireAuth><LoansPage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route
        path="/audit"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AuditPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />

      <Route
        path="*"
        element={
          <RequireAuth>
            <EmptyState title="Page not found" description="The page you are looking for does not exist." />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
