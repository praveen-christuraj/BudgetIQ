import { Box, useTheme } from '@mui/material';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/types';
import { formatCompactMoney, formatMoney } from '@/utils/format';

interface TrendChartProps {
  data: TrendPoint[];
  symbol?: string;
  height?: number;
}

export function TrendChart({ data, symbol = '₹', height = 300 }: TrendChartProps) {
  const theme = useTheme();

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5C6B62' }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={58}
            tick={{ fontSize: 11, fill: '#5C6B62' }}
            tickFormatter={(value: number) => formatCompactMoney(value, symbol)}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatMoney(value, { symbol }), name]}
            contentStyle={{ borderRadius: 10, border: `1px solid ${theme.palette.divider}`, fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="income" name="Income" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="expenses" name="Expenses" fill="#EF9A9A" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line
            type="monotone"
            dataKey="net"
            name="Net cash flow"
            stroke={theme.palette.primary.main}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
