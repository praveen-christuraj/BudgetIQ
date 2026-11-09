import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  path: string;
  icon: SvgIconComponent;
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: DashboardRoundedIcon },
      { label: 'Family Members', path: '/members', icon: GroupRoundedIcon },
      { label: 'Accounts', path: '/accounts', icon: AccountBalanceWalletRoundedIcon },
    ],
  },
  {
    title: 'Transactions',
    items: [
      { label: 'Income', path: '/income', icon: TrendingUpRoundedIcon },
      { label: 'Expenses', path: '/expenses', icon: TrendingDownRoundedIcon },
      { label: 'Transfers', path: '/transfers', icon: SwapHorizRoundedIcon },
      { label: 'Categories', path: '/categories', icon: CategoryRoundedIcon },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Monthly Budgets', path: '/budgets', icon: FactCheckRoundedIcon },
      { label: 'Recurring Payments', path: '/recurring', icon: EventRepeatRoundedIcon },
      { label: 'Savings Goals', path: '/savings', icon: SavingsRoundedIcon },
      { label: 'Loans & Debts', path: '/loans', icon: HandshakeRoundedIcon },
    ],
  },
  {
    title: 'Analytics & Administration',
    items: [
      { label: 'Reports', path: '/reports', icon: AssessmentRoundedIcon },
      { label: 'Notifications', path: '/notifications', icon: NotificationsActiveRoundedIcon },
      { label: 'Audit History', path: '/audit', icon: ReceiptLongRoundedIcon, adminOnly: true },
      { label: 'Settings', path: '/settings', icon: SettingsRoundedIcon },
    ],
  },
];
