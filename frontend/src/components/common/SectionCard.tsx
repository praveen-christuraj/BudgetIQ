import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  contentSx?: object;
  dense?: boolean;
}

export function SectionCard({ title, subtitle, action, children, contentSx, dense }: SectionCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: dense ? 2 : 2.5, '&:last-child': { pb: dense ? 2 : 2.5 }, ...contentSx }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5">{title}</Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
