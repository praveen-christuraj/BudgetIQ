import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatCompactMoney } from '@/utils/format';
import type { ScopeReport } from '@/types';

// Compares shared (household) money with personal money side by side.
export function ScopeChart({ data, symbol = '₹', height = 260 }: { data: ScopeReport; symbol?: string; height?: number }) {
  const rows = [
    { scope: 'Shared', income: data.shared_income, expenses: data.shared_expenses },
    { scope: 'Personal', income: data.personal_income, expenses: data.personal_expenses },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="scope" tickLine={false} />
        <YAxis tickFormatter={(value: number) => formatCompactMoney(value, symbol)} width={72} tickLine={false} />
        <Tooltip formatter={(value) => formatCompactMoney(Number(value), symbol)} />
        <Legend />
        <Bar dataKey="income" name="Income" fill="#2e7d32" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#ef6c00" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
