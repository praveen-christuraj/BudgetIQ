import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authApi } from '@/services/endpoints';
import { tokenStorage } from '@/services/api';
import type { AuthContextPayload } from '@/types';

type AuthStatus = 'loading' | 'setup' | 'authenticated' | 'unauthenticated';

interface SetupPayload {
  household_name: string;
  full_name: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  context: AuthContextPayload | null;
  householdName: string | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (payload: SetupPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [context, setContext] = useState<AuthContextPayload | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bootstrap = useCallback(async () => {
    try {
      const setupStatus = await authApi.status();
      setHouseholdName(setupStatus.household_name);
      if (!setupStatus.initialized) {
        setStatus('setup');
        return;
      }
      if (!tokenStorage.getAccess() && !tokenStorage.getRefresh()) {
        setStatus('unauthenticated');
        return;
      }
      const me = await authApi.me();
      setContext(me);
      setStatus('authenticated');
    } catch {
      tokenStorage.clear();
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const handler = () => {
      setContext(null);
      setStatus('unauthenticated');
      queryClient.clear();
    };
    window.addEventListener('ff:session-expired', handler);
    return () => window.removeEventListener('ff:session-expired', handler);
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password });
    tokenStorage.set(tokens.access_token, tokens.refresh_token);
    setContext(tokens.context);
    setStatus('authenticated');
  }, []);

  const setup = useCallback(async (payload: SetupPayload) => {
    const tokens = await authApi.setup(payload);
    tokenStorage.set(tokens.access_token, tokens.refresh_token);
    setContext(tokens.context);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Signing out locally must work even if the API is unreachable.
    }
    tokenStorage.clear();
    queryClient.clear();
    setContext(null);
    setStatus('unauthenticated');
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const me = await authApi.me();
    setContext(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      context,
      householdName,
      isAdmin: context?.role === 'admin',
      login,
      setup,
      logout,
      refresh,
    }),
    [status, context, householdName, login, setup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
