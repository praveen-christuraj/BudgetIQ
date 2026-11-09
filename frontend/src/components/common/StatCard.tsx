import { Box, Card, CardContent, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  loading?: boolean;
  hint?: string;
}

const TONES: Record<string, string> = {
  default: '#1B5E20',
  positive: '#2E7D32',
  negative: '#C62828',
  warning: '#ED6C02',
};

export function StatCard({ label, value, helper, icon, tone = 'default', loading, hint }: StatCardProps) {
  const accent = TONES[tone];
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={110} height={38} />
            ) : (
              <Tooltip title={hint ?? ''} disableHoverListener={!hint}>
                <Typography
                  variant="h2"
                  sx={{ fontSize: { xs: '1.35rem', md: '1.55rem' }, mt: 0.5, color: accent, fontVariantNumeric: 'tabular-nums' }}
                  noWrap
                >
                  {value}
                </Typography>
              </Tooltip>
            )}
            {helper && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {helper}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 40,
                height: 40,
                borderRadius: 2,
                color: accent,
                backgroundColor: `${accent}14`,
                flexShrink: 0,
                '& svg': { fontSize: 21 },
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
