import React, { useState } from 'react';
import {
  Activity,
  Bell,
  CheckCircle,
  AlertTriangle,
  Globe,
  LayoutDashboard,
  Sparkles,
  Menu,
  LogOut,
} from 'lucide-react';
import { Agency, NotificationItem } from '../types';
import { formatInTimezone } from '../lib/datetime';
import { ZevkarLogo } from './marketing/ZevkarLogo';

interface NavbarProps {
  agency: Agency;
  timezone?: string;
  notifications: NotificationItem[];
  onMarkNotificationsRead: () => void;
  showPublicLanding: boolean;
  onTogglePublicLanding: () => void;
  onLogoClick: () => void;
  dashboardHref?: string;
  onOpenOnboarding: () => void;
  pendingApprovalsCount: number;
  onOpenMobileMenu?: () => void;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  agency,
  timezone = 'UTC',
  notifications,
  onMarkNotificationsRead,
  showPublicLanding,
  onTogglePublicLanding,
  onLogoClick,
  dashboardHref = '/dashboard',
  onOpenOnboarding,
  onOpenMobileMenu,
  onSignOut,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#363125] bg-[#211D10]/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 gap-2 sm:gap-4">
        {/* Brand & Agency Selector */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="lg:hidden flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B] text-[#F0E9D9]"
              aria-label="Open console sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          <a
            href={dashboardHref}
            onClick={(e) => {
              e.preventDefault();
              onLogoClick();
            }}
            aria-label="Zevkar dashboard home"
            className="flex items-center text-left min-w-0 group"
          >
            <ZevkarLogo size="sm" />
          </a>

          <div className="hidden md:flex items-center h-6 w-px bg-[#363125]" />

          <div className="hidden md:flex items-center gap-2 rounded-md border border-[#363125] bg-[#171A1B] px-3 py-1.5 text-xs text-[#F0E9D9] whitespace-nowrap">
            <span className="font-medium">{agency.name}</span>
            <span className="rounded border border-[#363125] bg-[#211D10] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#B8AE9B]">
              {agency.tier}
            </span>
          </div>
        </div>

        {/* Right Action Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
            <span>
              {agency.onboardingCompleted === false
                ? `Resume Setup (${agency.onboardingStep || 1}/8)`
                : 'Setup Wizard'}
            </span>
          </button>

          <button
            type="button"
            onClick={onTogglePublicLanding}
            aria-label={showPublicLanding ? 'Open console' : 'Back to website'}
            className="inline-flex h-8 sm:h-auto items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#E9E5DC] transition-colors whitespace-nowrap"
          >
            {showPublicLanding ? (
              <>
                <LayoutDashboard className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                <span>Console</span>
              </>
            ) : (
              <>
                <Globe className="h-3.5 w-3.5 text-[#B5AA99]" aria-hidden="true" />
                <span className="hidden sm:inline">Website</span>
              </>
            )}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-[#383838] bg-[#202020] text-[#B5AA99] hover:text-[#E9E5DC] transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded bg-[#A51B0B] text-[10px] font-bold text-[#E9E5DC] tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#383838] bg-[#202020] p-4 shadow-2xl z-50">
                <div className="flex items-center justify-between pb-3 border-b border-[#383838]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#E9E5DC]">System Alerts</span>
                    {unreadCount > 0 && (
                      <span className="rounded border border-[#61231C] bg-[#2B1513] px-2 py-0.5 text-[11px] font-medium text-[#E88A7E] tabular-nums">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkNotificationsRead}
                      className="text-xs text-[#C52A18] hover:text-[#E9E5DC] font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#B5AA99] text-center py-4">No recent notifications</p>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-3 rounded-lg border text-xs ${
                          notif.isRead
                            ? 'bg-[#171717] border-[#383838]/60 text-[#B5AA99]'
                            : 'bg-[#211D10] border-[#544021] text-[#E9E5DC]'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {notif.type === 'APPROVAL_REQUEST' ? (
                            <AlertTriangle className="h-4 w-4 text-[#E2B066] shrink-0 mt-0.5" aria-hidden="true" />
                          ) : notif.type === 'RECOVERY_SUCCESS' ? (
                            <CheckCircle className="h-4 w-4 text-[#8CC59B] shrink-0 mt-0.5" aria-hidden="true" />
                          ) : (
                            <Activity className="h-4 w-4 text-[#E88A7E] shrink-0 mt-0.5" aria-hidden="true" />
                          )}
                          <div>
                            <p className="font-semibold text-[#E9E5DC]">{notif.title}</p>
                            <p className="mt-0.5 text-[#B5AA99] leading-relaxed">{notif.message}</p>
                            <span className="mt-1 block font-mono text-[10px] text-[#B5AA99]/75 tabular-nums">
                              {formatInTimezone(notif.createdAt, timezone, 'datetime')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-[#383838] bg-[#202020] text-[#B5AA99] hover:text-[#E9E5DC]"
              title="Sign Out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
