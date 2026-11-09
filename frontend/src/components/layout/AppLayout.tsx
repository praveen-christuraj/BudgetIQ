import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { notificationsApi } from '@/services/endpoints';
import { initials } from '@/utils/format';

import { navigation } from './navigation';

const DRAWER_WIDTH = 272;

function BrandMark() {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2.5, py: 2 }}>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          background: 'linear-gradient(135deg, #2E7D32 0%, #1B5E20 60%, #0B3D12 100%)',
        }}
      >
        <SavingsRoundedIcon fontSize="small" />
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.15, fontSize: '0.95rem' }}>
          Family Finance
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Manager
        </Typography>
      </Box>
    </Stack>
  );
}

function DrawerContent({ onNavigate }: { onNavigate?: () => void }) {
  const { context, isAdmin } = useAuth();
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BrandMark />
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {navigation.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (!items.length) return null;
          return (
            <Box key={group.title} sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  px: 3,
                  pt: 1.5,
                  pb: 0.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'text.disabled',
                  fontSize: '0.66rem',
                }}
              >
                {group.title}
              </Typography>
              <List disablePadding>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.path);
                  return (
                    <ListItemButton
                      key={item.path}
                      component={RouterLink}
                      to={item.path}
                      selected={active}
                      onClick={onNavigate}
                      sx={{
                        py: 1,
                        '&.Mui-selected': {
                          backgroundColor: 'rgba(27, 94, 32, 0.09)',
                          color: 'primary.dark',
                          '& .MuiListItemIcon-root': { color: 'primary.main' },
                          '&:hover': { backgroundColor: 'rgba(27, 94, 32, 0.13)' },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : 'text.secondary' }}>
                        <Icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ fontSize: '0.855rem', fontWeight: active ? 700 : 500 }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </Box>
          );
        })}
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar sx={{ width: 34, height: 34, bgcolor: context?.display_color ?? 'primary.main', fontSize: '0.8rem' }}>
            {initials(context?.user.full_name ?? 'User')}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {context?.user.full_name}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              color={isAdmin ? 'primary' : 'default'}
              label={isAdmin ? 'Administrator' : 'Member'}
              sx={{ height: 18, fontSize: '0.62rem', mt: 0.25 }}
            />
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

function TopBar({ onOpenMenu, drawerVisible }: { onOpenMenu: () => void; drawerVisible: boolean }) {
  const { context, logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const { data: counts } = useQuery({
    queryKey: ['notifications', 'counts'],
    queryFn: notificationsApi.counts,
    refetchInterval: 60_000,
    retry: 0,
  });

  return (
    <AppBar
      position="fixed"
      sx={{
        width: drawerVisible ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
        ml: drawerVisible ? `${DRAWER_WIDTH}px` : 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        color: 'text.primary',
      }}
    >
      <Toolbar sx={{ minHeight: 64 }}>
        {!drawerVisible && (
          <IconButton edge="start" onClick={onOpenMenu} sx={{ mr: 1 }} aria-label="Open navigation">
            <MenuRoundedIcon />
          </IconButton>
        )}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {context?.household_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Private household · {context?.relationship_label ?? 'Member'}
          </Typography>
        </Box>
        <Tooltip title="Notifications">
          <IconButton onClick={() => navigate('/notifications')} aria-label="Notifications">
            <Badge badgeContent={counts?.unread ?? 0} color="error" max={99}>
              <NotificationsNoneRoundedIcon />
            </Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="Account">
          <IconButton onClick={(event) => setAnchor(event.currentTarget)} sx={{ ml: 0.5 }} aria-label="Account menu">
            <Avatar sx={{ width: 32, height: 32, bgcolor: context?.display_color ?? 'primary.main', fontSize: '0.78rem' }}>
              {initials(context?.user.full_name ?? 'User')}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
            <Typography variant="subtitle2">{context?.user.full_name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {context?.user.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={() => { setAnchor(null); navigate('/settings'); }}>
            <ListItemIcon><SettingsRoundedIcon fontSize="small" /></ListItemIcon>
            Settings
          </MenuItem>
          <MenuItem onClick={() => { setAnchor(null); navigate('/settings?tab=security'); }}>
            <ListItemIcon><ShieldRoundedIcon fontSize="small" /></ListItemIcon>
            Change password
          </MenuItem>
          <MenuItem onClick={() => { setAnchor(null); navigate('/members'); }}>
            <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
            Family members
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { void logout(); }}>
            <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            backgroundColor: '#FBFCFB',
          },
        }}
      >
        <DrawerContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <TopBar onOpenMenu={() => setMobileOpen(true)} drawerVisible={desktop} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 2, md: 3.5 },
          pb: 5,
          pt: { xs: 10, md: 11 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
