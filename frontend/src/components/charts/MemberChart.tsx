import { Box, useTheme } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MemberSpend } from '@/types';
import { formatCompactMoney, formatMoney } from '@/utils/format';

export function MemberChart({ data, symbol = '₹', height = 260 }: { data: MemberSpend[]; symbol?: string; height?: number }) {
  const theme = useTheme();

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#5C6B62' }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: '#5C6B62' }}
            tickFormatter={(value: number) => formatCompactMoney(value, symbol)}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatMoney(value, { symbol }), name]}
            contentStyle={{ borderRadius: 10, border: `1px solid ${theme.palette.divider}`, fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} maxBarSize={30} />
          <Bar dataKey="expenses" name="Expenses" fill="#FFB74D" radius={[4, 4, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
