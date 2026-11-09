import { Typography, type TypographyProps } from '@mui/material';
import { formatMoney } from '@/utils/format';

interface MoneyTextProps extends Omit<TypographyProps, 'children'> {
  value: number | null | undefined;
  symbol?: string;
  signed?: boolean;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}

export function MoneyText({ value, symbol = '₹', signed, tone = 'default', sx, ...rest }: MoneyTextProps) {
  const color =
    tone === 'positive'
      ? 'success.main'
      : tone === 'negative'
        ? 'error.main'
        : tone === 'muted'
          ? 'text.secondary'
          : 'text.primary';
  return (
    <Typography
      component="span"
      sx={{ fontVariantNumeric: 'tabular-nums', color, ...sx }}
      {...rest}
    >
      {formatMoney(value, { symbol, signed })}
    </Typography>
  );
}
