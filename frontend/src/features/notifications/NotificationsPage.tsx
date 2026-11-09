import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';

import { useFeedback } from '@/components/common/FeedbackProvider';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { notificationsApi } from '@/services/endpoints';
import type { Notification } from '@/types';
import { formatDateTime } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';

function iconFor(notification: Notification) {
  const common = { fontSize: 'small' as const };
  switch (notification.type) {
    case 'budget_warning':
      return <WarningAmberRoundedIcon {...common} />;
    case 'budget_exceeded':
      return <ErrorOutlineRoundedIcon {...common} />;
    case 'recurring_due':
      return <EventRoundedIcon {...common} />;
    case 'loan_due':
      return <HandshakeRoundedIcon {...common} />;
    case 'goal_achieved':
      return <SavingsRoundedIcon {...common} />;
    default:
      return <FactCheckRoundedIcon {...common} />;
  }
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'rgba(198,40,40,0.08)',
  warning: 'rgba(237,108,2,0.08)',
  success: 'rgba(46,125,50,0.08)',
  info: 'rgba(2,119,189,0.08)',
};

const SEVERITY_FG: Record<string, string> = {
  critical: 'error.main',
  warning: 'warning.main',
  success: 'success.main',
  info: 'info.main',
};

export function NotificationsPage() {
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications', tab],
    queryFn: () => notificationsApi.list(tab === 'unread'),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Budget thresholds, upcoming payments, loan due dates and savings milestones."
        actions={
          <Button
            variant="outlined"
            startIcon={<DoneAllRoundedIcon />}
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending || unreadCount === 0}
          >
            Mark all read
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 3 }}>
        Notifications are generated from current financial data — open this page after recording transactions to refresh
        budget warnings.
      </Alert>

      <Card>
        <Tabs value={tab} onChange={(_event, value: 'all' | 'unread') => setTab(value)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="all" label="All notifications" />
          <Tab value="unread" label={`Unread${unreadCount ? ` (${unreadCount})` : ''}`} />
        </Tabs>

        {isLoading ? (
          <LoadingBlock label="Loading notifications…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load notifications'} onRetry={() => void refetch()} />
        ) : notifications.length ? (
          <Stack divider={<Divider flexItem />}>
            {notifications.map((notification) => (
              <Stack
                key={notification.id}
                direction="row"
                spacing={2}
                alignItems="flex-start"
                sx={{ p: 2.5, backgroundColor: notification.is_read ? 'transparent' : 'rgba(27,94,32,0.03)' }}
              >
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 1.5,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    backgroundColor: SEVERITY_BG[notification.severity] ?? SEVERITY_BG.info,
                    color: SEVERITY_FG[notification.severity] ?? SEVERITY_FG.info,
                  }}
                >
                  {iconFor(notification)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={notification.is_read ? 500 : 700}>
                      {notification.title}
                    </Typography>
                    {!notification.is_read && <Chip size="small" color="primary" label="New" sx={{ height: 18, fontSize: '0.6rem' }} />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {notification.message}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                    {formatDateTime(notification.created_at)}
                  </Typography>
                </Box>
                {!notification.is_read && (
                  <Tooltip title="Mark as read">
                    <IconButton size="small" onClick={() => markReadMutation.mutate(notification.id)} aria-label="Mark as read">
                      <CheckRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            ))}
          </Stack>
        ) : (
          <EmptyState
            title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            description="Budget limits, due payments and savings milestones will show up here."
            icon={<NotificationsActiveRoundedIcon fontSize="inherit" />}
          />
        )}
      </Card>
    </>
  );
}
