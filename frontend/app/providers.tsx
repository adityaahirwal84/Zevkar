'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  api,
  ApiError,
  clearSession,
  getOrganizationId,
  getStoredToken,
  Organization,
  setOrganizationId,
  setStoredToken,
  AuthProfile,
} from '@/lib/api-client';

interface AuthContextValue {
  profile: AuthProfile | null;
  organizations: Organization[];
  organizationId: string | null;
  ready: boolean;
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (values: { email: string; name: string; password: string; agency_name: string }) => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const loadProfile = useCallback(async (preferredOrganizationId?: string | null) => {
    let token = getStoredToken();
    if (!token) {
      const session = await api.auth.refresh();
      token = session.access_token;
      setStoredToken(token);
    }

    let orgs: Organization[];
    try {
      orgs = await api.organizations.list();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const session = await api.auth.refresh();
      token = session.access_token;
      setStoredToken(token);
      orgs = await api.organizations.list();
    }
    if (orgs.length === 0) {
      throw new Error('Your account is not a member of an active organization.');
    }
    const storedOrganizationId = preferredOrganizationId || getOrganizationId();
    const selected = orgs.find((organization) => organization.id === storedOrganizationId) || orgs[0];
    setOrganizationId(selected.id);
    setActiveOrganizationId(selected.id);
    setOrganizations(orgs);
    setProfile(await api.auth.me());
  }, []);

  useEffect(() => {
    let active = true;
    const handleExpiredSession = () => {
      clearSession();
      setProfile(null);
      setOrganizations([]);
      setActiveOrganizationId(null);
      setSessionError('Your session expired. Sign in again to continue.');
    };
    window.addEventListener('session-expired', handleExpiredSession);
    if (!getStoredToken() && (pathname === '/' || pathname === '/login')) {
      setReady(true);
      return () => {
        active = false;
        window.removeEventListener('session-expired', handleExpiredSession);
      };
    }

    setReady(false);
    (async () => {
      try {
        await loadProfile();
      } catch (error) {
        clearSession();
        if (active) {
          setProfile(null);
          setOrganizations([]);
          setActiveOrganizationId(null);
          setSessionError(
            error instanceof ApiError && error.status === 401
              ? 'Your session expired. Sign in again to continue.'
              : 'We could not restore your session. Please sign in again.',
          );
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
      window.removeEventListener('session-expired', handleExpiredSession);
    };
  }, [loadProfile, pathname]);

  const establishSession = useCallback(async (accessToken: string) => {
    setStoredToken(accessToken);
    setSessionError(null);
    await loadProfile();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.auth.login({ email, password });
    await establishSession(session.access_token);
  }, [establishSession]);

  const signUp = useCallback(async (values: {
    email: string; name: string; password: string; agency_name: string;
  }) => {
    const session = await api.auth.signup(values);
    await establishSession(session.access_token);
  }, [establishSession]);

  const switchOrganization = useCallback(async (nextOrganizationId: string) => {
    const previousOrganizationId = getOrganizationId();
    setOrganizationId(nextOrganizationId);
    try {
      const nextProfile = await api.auth.me();
      setActiveOrganizationId(nextOrganizationId);
      setProfile(nextProfile);
    } catch (error) {
      if (previousOrganizationId) setOrganizationId(previousOrganizationId);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (getStoredToken()) await api.auth.logout();
    } finally {
      clearSession();
      setProfile(null);
      setOrganizations([]);
      setActiveOrganizationId(null);
      setSessionError(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    organizations,
    organizationId,
    ready,
    sessionError,
    signIn,
    signUp,
    switchOrganization,
    signOut,
  }), [profile, organizations, organizationId, ready, sessionError, signIn, signUp, switchOrganization, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {sessionError && (
        <div
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-slate-950 px-4 py-3 text-sm text-amber-100 shadow-xl"
          role="alert"
        >
          <span>{sessionError}</span>
          <a className="shrink-0 font-semibold underline underline-offset-4" href="/login">
            Sign in
          </a>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          return failureCount < 1 && (status === undefined || status >= 500);
        },
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AppProviders');
  return value;
}
