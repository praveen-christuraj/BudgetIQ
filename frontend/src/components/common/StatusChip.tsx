import { Chip } from '@mui/material';
import type { BudgetStatus, Severity, TransactionStatus } from '@/types';
import { budgetStatusColor, severityColor, transactionStatusColor } from '@/utils/status';

export function TransactionStatusChip({ status }: { status: TransactionStatus }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={transactionStatusColor(status)}
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      sx={{ height: 22, fontSize: '0.7rem' }}
    />
  );
}

export function ScopeChip({ scope }: { scope: 'shared' | 'personal' }) {
  return (
    <Chip
      size="small"
      label={scope === 'shared' ? 'Shared' : 'Personal'}
      color={scope === 'shared' ? 'primary' : 'secondary'}
      variant="outlined"
      sx={{ height: 22, fontSize: '0.7rem' }}
    />
  );
}

export function BudgetStatusChip({ status, label }: { status: BudgetStatus; label?: string }) {
  return (
    <Chip
      size="small"
      color={budgetStatusColor(status)}
      label={label ?? (status === 'ok' ? 'On track' : status === 'warning' ? 'Near limit' : 'Over budget')}
      sx={{ height: 22, fontSize: '0.7rem' }}
    />
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <Chip
      size="small"
      color={severityColor(severity)}
      label={severity.charAt(0).toUpperCase() + severity.slice(1)}
      sx={{ height: 22, fontSize: '0.7rem' }}
    />
  );
}
