import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Agency, Role, User } from '../types';
import { AppRoute, getDashboardRouteForRole } from '../lib/router';
import {
  apiJson,
  ApiError,
  AuthProfileResponse,
  AuthTokenResponse,
  AUTH_SESSION_EXPIRED_EVENT,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../lib/api';

export const EMPTY_AGENCY: Agency = {
  id: '',
  name: 'My Workspace',
  slug: 'workspace',
  tier: 'STARTER',
  contactEmail: '',
  timezone: 'UTC',
  onboardingStep: 1,
  onboardingCompleted: false,
  createdAt: '',
  clientsCount: 0,
  workflowsCount: 0,
};

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
  loginWithAuthResponse: (payload: AuthTokenResponse) => Promise<{
    token: string;
    user: User;
    agency: Agency;
    dashboardRoute: AppRoute;
  }>;
  refreshSession: () => Promise<boolean>;
  clearLocalSession: () => void;
  logout: () => Promise<void>;
  hasActiveToken: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const validRoles = new Set<Role>(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
const validTiers = new Set<Agency['tier']>(['FREE', 'STARTER', 'GROWTH', 'AGENCY_PRO', 'PRO', 'ENTERPRISE']);

function mapProfile(profile: AuthProfileResponse): { user: User; agency: Agency } {
  const { user, agency } = profile;
  if (!validRoles.has(user.role as Role)) {
    throw new ApiError('The profile response contains an unsupported user role.', 502, profile);
  }
  if (!validTiers.has(agency.tier as Agency['tier'])) {
    throw new ApiError('The profile response contains an unsupported subscription tier.', 502, profile);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      role: user.role as Role,
      agencyId: user.agencyId,
      createdAt: user.createdAt,
    },
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      tier: agency.tier as Agency['tier'],
      contactEmail: agency.contactEmail,
      timezone: agency.timezone,
      onboardingStep: agency.onboardingStep,
      onboardingCompleted: agency.onboardingCompleted,
      createdAt: agency.createdAt,
      clientsCount: agency.clientsCount,
      workflowsCount: agency.workflowsCount,
    },
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [agency, setAgency] = useState<Agency>(EMPTY_AGENCY);
  const [isInitializing, setIsInitializing] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const persistSession = useCallback((nextToken: string | null, nextUser: User | null, nextAgency: Agency | null) => {
    tokenRef.current = nextToken;
    setAccessToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setAgency(nextAgency ?? EMPTY_AGENCY);
  }, []);

  const clearLocalSession = useCallback(() => {
    persistSession(null, null, null);
  }, [persistSession]);

  const loadProfile = useCallback(async (activeToken: string) => {
    setAccessToken(activeToken);
    const profile = await apiJson<AuthProfileResponse>('/api/v1/auth/me');
    const normalized = mapProfile(profile);
    const currentToken = getAccessToken() ?? activeToken;
    persistSession(currentToken, normalized.user, normalized.agency);
    return normalized;
  }, [persistSession]);

  const loginWithAuthResponse = useCallback(
    async (payload: AuthTokenResponse) => {
      if (!payload.access_token) {
        throw new ApiError('Authentication response did not contain an access token.', 502, payload);
      }

      try {
        const normalized = await loadProfile(payload.access_token);
        const sessionToken = getAccessToken() ?? payload.access_token;
        return {
          token: sessionToken,
          ...normalized,
          dashboardRoute: getDashboardRouteForRole(normalized.user.role),
        };
      } catch (error) {
        clearLocalSession();
        throw error;
      }
    },
    [clearLocalSession, loadProfile]
  );

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) {
        clearLocalSession();
        return false;
      }
      await loadProfile(refreshedToken);
      return true;
    } catch (error) {
      clearLocalSession();
      console.error('Unable to restore the authenticated session.', error);
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [clearLocalSession, loadProfile]);

  const updateAgencyOnboarding = useCallback((onboardingStep: number, onboardingCompleted: boolean) => {
    setAgency((previous) => ({
      ...previous,
      onboardingStep,
      onboardingCompleted,
      onboardingCompletedAt: onboardingCompleted
        ? previous.onboardingCompletedAt || new Date().toISOString()
        : previous.onboardingCompletedAt,
    }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiJson<{ success: boolean }>('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearLocalSession();
    }
  }, [clearLocalSession]);

  const hasActiveToken = useCallback(() => Boolean(tokenRef.current || getAccessToken()), []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onSessionExpired = () => clearLocalSession();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [clearLocalSession]);

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
      refreshSession,
      clearLocalSession,
      logout,
      hasActiveToken,
    }),
    [
      agency,
      clearLocalSession,
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
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
