import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import type { ReactNode } from 'react';

export function LoadingBlock({ label = 'Loading…', minHeight = 160 }: { label?: string; minHeight?: number }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ minHeight, width: '100%' }}>
      <CircularProgress size={26} thickness={4} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 5, px: 2, textAlign: 'center' }}>
      <Box sx={{ color: 'text.disabled', '& svg': { fontSize: 44 } }}>
        {icon ?? <InboxRoundedIcon fontSize="inherit" />}
      </Box>
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 5, px: 2, textAlign: 'center' }}>
      <ErrorOutlineRoundedIcon color="error" sx={{ fontSize: 42 }} />
      <Typography variant="h6">Something went wrong</Typography>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" size="small" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Stack>
  );
}
