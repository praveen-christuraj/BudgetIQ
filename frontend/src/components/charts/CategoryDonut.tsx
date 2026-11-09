import { Box, Stack, Typography, useTheme } from '@mui/material';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategorySlice } from '@/types';
import { formatMoney } from '@/utils/format';

interface CategoryDonutProps {
  data: CategorySlice[];
  symbol?: string;
  height?: number;
}

export function CategoryDonut({ data, symbol = '₹', height = 240 }: CategoryDonutProps) {
  const theme = useTheme();
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  if (!data.length) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No expenses recorded for this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
      <Box sx={{ width: { xs: '100%', sm: 200 }, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatMoney(value, { symbol })}
              contentStyle={{ borderRadius: 10, border: `1px solid ${theme.palette.divider}`, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box sx={{ flex: 1, width: '100%', maxHeight: height, overflowY: 'auto', pr: 0.5 }}>
        <Stack spacing={0.75}>
          {data.map((item) => (
            <Stack key={item.name} direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap title={item.name}>
                {item.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.percent.toFixed(0)}%
              </Typography>
              <Typography variant="caption" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(item.amount, { symbol })}
              </Typography>
            </Stack>
          ))}
          <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              Total
            </Typography>
            <Typography variant="caption" fontWeight={700}>
              {formatMoney(total, { symbol })}
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}
