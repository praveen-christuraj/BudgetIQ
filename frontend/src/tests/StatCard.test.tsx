import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatCard } from '@/components/common/StatCard';
import { theme } from '@/theme/theme';

describe('StatCard', () => {
  it('renders the label, value and helper text', () => {
    render(
      <ThemeProvider theme={theme}>
        <StatCard label="Total expenses" value="₹20,000.00" helper="Shared + personal" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Total expenses')).toBeInTheDocument();
    expect(screen.getByText('₹20,000.00')).toBeInTheDocument();
    expect(screen.getByText('Shared + personal')).toBeInTheDocument();
  });
});
