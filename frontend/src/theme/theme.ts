import { createTheme, alpha } from '@mui/material/styles';

// Clean, enterprise dashboard theme: deep green primary, calm neutrals,
// generous spacing and subtle borders instead of heavy shadows.
const primary = '#1B5E20';
const secondary = '#00695C';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: primary, light: '#4C8C4A', dark: '#003D00', contrastText: '#FFFFFF' },
    secondary: { main: secondary, light: '#439889', dark: '#003D33' },
    success: { main: '#2E7D32' },
    warning: { main: '#ED6C02' },
    error: { main: '#C62828' },
    info: { main: '#0277BD' },
    background: { default: '#F4F6F5', paper: '#FFFFFF' },
    text: { primary: '#1C2B22', secondary: '#5C6B62' },
    divider: '#E2E8E4',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.1rem', fontWeight: 600 },
    h5: { fontSize: '1rem', fontWeight: 600 },
    h6: { fontSize: '0.95rem', fontWeight: 600 },
    subtitle2: { fontWeight: 600, letterSpacing: '0.01em' },
    button: { textTransform: 'none', fontWeight: 600 },
    body2: { fontSize: '0.875rem' },
    caption: { fontSize: '0.75rem', letterSpacing: '0.01em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#F4F6F5' },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': { backgroundColor: '#C7D2CB', borderRadius: 8 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: { borderColor: '#E2E8E4' },
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0, variant: 'outlined' },
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderColor: t.palette.divider,
          transition: 'box-shadow 140ms ease, border-color 140ms ease',
          '&:hover': { borderColor: alpha(t.palette.primary.main, 0.35) },
        }),
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, paddingInline: 16 },
        containedPrimary: { '&:hover': { backgroundColor: '#12441A' } },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', fullWidth: true },
    },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: '#EDF1EE', paddingTop: 10, paddingBottom: 10 },
        head: {
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#5C6B62',
          fontWeight: 700,
          backgroundColor: '#FAFBFA',
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 999, height: 8 } } },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 8, marginInline: 8, marginBlock: 1 } },
    },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
  },
});
