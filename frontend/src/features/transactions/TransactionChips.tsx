import { Chip } from '@mui/material';
import type { TransactionStatus } from '@/types';
import { transactionStatusColor } from '@/utils/status';

export function StatusChipForTransaction({ status }: { status: TransactionStatus }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={transactionStatusColor(status)}
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      sx={{ height: 18, fontSize: '0.62rem', mt: 0.25 }}
    />
  );
}
