'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  clearStoredTokens,
  getDashboardRouteForRole,
  getStoredUserRole,
  hasStoredToken,
  setStoredUserRole,
} from '@/lib/api-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone?: string;
  agency_id: string;
  role: string;
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  orgName: string | null;
  onboardingCompleted: boolean | null;
  onboardingStep: number;
  isAuthenticated: boolean;
  isLoading: boolean;
  dashboardRoute: string;
  refreshSession: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    if (!hasStoredToken()) {
      setUser(null);
      setOrgName(null);
      setOnboardingCompleted(null);
      setOnboardingStep(1);
      setIsAuthenticated(false);
      setIsLoading(false);
      return null;
    }

    try {
      const me = await api.auth.me();
      let resolvedOnboardingCompleted: boolean | undefined;
      let resolvedOnboardingStep = 1;
      setIsAuthenticated(true);
      if (me?.role) {
        setStoredUserRole(me.role);
      }
      try {
        const org = await api.orgs.current();
        setOrgName(org?.name || null);
        if (typeof org?.onboarding_completed === 'boolean') {
          resolvedOnboardingCompleted = org.onboarding_completed;
          setOnboardingCompleted(org.onboarding_completed);
        }
        if (typeof org?.onboarding_step === 'number') {
          resolvedOnboardingStep = org.onboarding_step;
          setOnboardingStep(org.onboarding_step);
        }
      } catch {
        // Keep authenticated state if org metadata endpoint is unavailable
      }
      const enrichedUser: AuthUser = {
        ...me,
        onboarding_completed: resolvedOnboardingCompleted,
        onboarding_step: resolvedOnboardingStep,
      };
      setUser(enrichedUser);
      return enrichedUser;
    } catch (err: any) {
      if (err?.status === 401) {
        clearStoredTokens();
        setUser(null);
        setOrgName(null);
        setOnboardingCompleted(null);
        setOnboardingStep(1);
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(hasStoredToken());
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Clear local session regardless of backend availability
    }
    clearStoredTokens();
    setUser(null);
    setOrgName(null);
    setOnboardingCompleted(null);
    setOnboardingStep(1);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'access_token') {
        refreshSession();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshSession]);

  const role = user?.role || getStoredUserRole();
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      orgName,
      onboardingCompleted,
      onboardingStep,
      isAuthenticated,
      isLoading,
      dashboardRoute: getDashboardRouteForRole(role),
      refreshSession,
      logout,
    }),
    [isAuthenticated, isLoading, logout, onboardingCompleted, onboardingStep, orgName, refreshSession, role, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
