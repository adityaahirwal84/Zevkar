import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Agency, Role, User } from '../types';
import { AppRoute, getDashboardRouteForRole } from '../lib/router';

export const SESSION_TOKEN_KEY = 'doctor_session_token';
export const REFRESH_TOKEN_KEY = 'deltaai_refresh_token';
export const SESSION_USER_KEY = 'deltaai_session_user';
export const SESSION_AGENCY_KEY = 'deltaai_session_agency';

export const EMPTY_AGENCY: Agency = {
  id: '',
  name: 'My Workspace',
  slug: 'workspace',
  tier: 'STARTER',
  contactEmail: '',
  timezone: 'UTC',
  onboardingStep: 1,
  onboardingCompleted: false,
  createdAt: new Date().toISOString(),
  clientsCount: 0,
  workflowsCount: 0,
};

export const DEFAULT_AGENCY: Agency = {
  id: 'agency_apex_01',
  name: 'Apex Automation Labs',
  slug: 'apex-automations',
  tier: 'GROWTH',
  contactEmail: 'ops@apexautomations.io',
  timezone: 'UTC',
  onboardingStep: 8,
  onboardingCompleted: true,
  createdAt: new Date().toISOString(),
  clientsCount: 4,
  workflowsCount: 12,
};

export const DEMO_OWNER_USER: User = {
  id: 'u_1',
  email: 'aditya84azm@gmail.com',
  name: 'Aditya Mehta',
  role: 'OWNER',
  agencyId: 'agency_apex_01',
  createdAt: '2026-01-10T08:00:00Z',
};

export function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function readStoredAgency(): Agency {
  try {
    const raw = localStorage.getItem(SESSION_AGENCY_KEY);
    if (!raw) return EMPTY_AGENCY;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.name === 'string' ? parsed : EMPTY_AGENCY;
  } catch {
    return EMPTY_AGENCY;
  }
}

interface AuthResponsePayload {
  token?: string;
  refreshToken?: string;
  user?: User;
  agency?: Agency;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  agency: Agency;
  isAuthenticated: boolean;
  isInitializing: boolean;
  dashboardRoute: AppRoute;
  userRole: Role | undefined;
  setAgencyContext: React.Dispatch<React.SetStateAction<Agency>>;
  updateAgencyOnboarding: (onboardingStep: number, onboardingCompleted: boolean) => void;
  loginWithAuthResponse: (payload: AuthResponsePayload) => {
    token: string | null;
    user: User | null;
    dashboardRoute: AppRoute;
  };
  establishDemoSession: () => { token: string; user: User };
  refreshSession: (overrideToken?: string | null) => Promise<boolean>;
  clearLocalSession: () => void;
  logout: () => Promise<void>;
  hasActiveToken: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(SESSION_TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [agency, setAgency] = useState<Agency>(() => readStoredAgency());
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const tokenRef = useRef<string | null>(token);

  const persistSession = useCallback(
    (nextToken: string | null, nextRefreshToken: string | null, nextUser: User | null, nextAgency?: Agency | null) => {
      tokenRef.current = nextToken;
      setToken(nextToken);
      setUser(nextUser);

      if (nextToken) {
        localStorage.setItem(SESSION_TOKEN_KEY, nextToken);
      } else {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }

      if (nextRefreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
      } else if (!nextToken) {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }

      if (nextUser) {
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(nextUser));
      } else {
        localStorage.removeItem(SESSION_USER_KEY);
      }

      if (nextAgency) {
        setAgency(nextAgency);
        localStorage.setItem(SESSION_AGENCY_KEY, JSON.stringify(nextAgency));
      } else if (!nextToken) {
        setAgency(EMPTY_AGENCY);
        localStorage.removeItem(SESSION_AGENCY_KEY);
      }
    },
    []
  );

  const updateAgencyOnboarding = useCallback((onboardingStep: number, onboardingCompleted: boolean) => {
    setAgency((prev) => {
      const updated: Agency = {
        ...prev,
        onboardingStep,
        onboardingCompleted,
        onboardingCompletedAt: onboardingCompleted ? (prev.onboardingCompletedAt || new Date().toISOString()) : prev.onboardingCompletedAt,
      };
      try {
        localStorage.setItem(SESSION_AGENCY_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
  }, []);

  const clearLocalSession = useCallback(() => {
    persistSession(null, null, null, null);
  }, [persistSession]);

  const loginWithAuthResponse = useCallback(
    (payload: AuthResponsePayload) => {
      const nextToken = payload.token || localStorage.getItem(SESSION_TOKEN_KEY);
      const nextRefresh = payload.refreshToken || localStorage.getItem(REFRESH_TOKEN_KEY);
      const nextUser = payload.user || readStoredUser();
      const nextAgency = payload.agency || agency;
      persistSession(nextToken, nextRefresh, nextUser, nextAgency);
      return {
        token: nextToken,
        user: nextUser,
        dashboardRoute: getDashboardRouteForRole(nextUser?.role),
      };
    },
    [agency, persistSession]
  );

  const establishDemoSession = useCallback(() => {
    const existingToken = tokenRef.current || localStorage.getItem(SESSION_TOKEN_KEY) || 'jwt_mock_token_valid_session_24h';
    const existingUser = readStoredUser() || DEMO_OWNER_USER;
    const demoAgency = agency.id ? agency : DEFAULT_AGENCY;
    persistSession(existingToken, localStorage.getItem(REFRESH_TOKEN_KEY), existingUser, demoAgency);
    return { token: existingToken, user: existingUser };
  }, [agency, persistSession]);

  const refreshSession = useCallback(
    async (overrideToken?: string | null): Promise<boolean> => {
      const activeToken =
        overrideToken !== undefined
          ? overrideToken
          : tokenRef.current || localStorage.getItem(SESSION_TOKEN_KEY);

      if (!activeToken) {
        setIsInitializing(false);
        return false;
      }

      try {
        const res = await fetch('/api/v1/auth/me', {
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${activeToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          const nextUser = data.user || readStoredUser();
          const nextAgency = data.agency || agency;
          persistSession(activeToken, localStorage.getItem(REFRESH_TOKEN_KEY), nextUser, nextAgency);
          return true;
        }

        if (res.status === 401) {
          const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
          if (storedRefresh) {
            const refreshRes = await fetch('/api/v1/auth/refresh', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: storedRefresh }),
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              persistSession(
                refreshData.token,
                refreshData.refreshToken || storedRefresh,
                refreshData.user || readStoredUser(),
                refreshData.agency || agency
              );
              return true;
            }
          }
          clearLocalSession();
          return false;
        }
        return true;
      } catch {
        return Boolean(activeToken);
      } finally {
        setIsInitializing(false);
      }
    },
    [agency, clearLocalSession, persistSession]
  );

  const logout = useCallback(async () => {
    const activeToken = tokenRef.current || localStorage.getItem(SESSION_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (activeToken || refreshToken) {
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    clearLocalSession();
  }, [clearLocalSession]);

  const hasActiveToken = useCallback(() => {
    return Boolean(tokenRef.current || localStorage.getItem(SESSION_TOKEN_KEY));
  }, []);

  useEffect(() => {
    refreshSession();
    // Validate once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_TOKEN_KEY || e.key === SESSION_USER_KEY || e.key === SESSION_AGENCY_KEY) {
        const nextToken = localStorage.getItem(SESSION_TOKEN_KEY);
        tokenRef.current = nextToken;
        setToken(nextToken);
        setUser(nextToken ? readStoredUser() : null);
        setAgency(nextToken ? readStoredAgency() : EMPTY_AGENCY);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      agency,
      isAuthenticated: Boolean(token),
      isInitializing,
      dashboardRoute: getDashboardRouteForRole(user?.role),
      userRole: user?.role,
      setAgencyContext: setAgency,
      updateAgencyOnboarding,
      loginWithAuthResponse,
      establishDemoSession,
      refreshSession,
      clearLocalSession,
      logout,
      hasActiveToken,
    }),
    [
      agency,
      clearLocalSession,
      establishDemoSession,
      hasActiveToken,
      isInitializing,
      loginWithAuthResponse,
      logout,
      refreshSession,
      token,
      updateAgencyOnboarding,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
