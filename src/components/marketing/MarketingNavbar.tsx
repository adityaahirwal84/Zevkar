import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutDashboard, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { AppRoute } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { ZevkarLogo } from './ZevkarLogo';

interface MarketingNavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const DESKTOP_NAV_ITEMS: { label: string; route: AppRoute }[] = [
  { label: 'Product', route: '/product' },
  { label: 'Features', route: '/features' },
  { label: 'Integrations', route: '/integrations' },
  { label: 'Pricing', route: '/pricing' },
  { label: 'Docs', route: '/docs' },
  { label: 'Blog', route: '/blog' },
];

const MOBILE_NAV_ITEMS: { label: string; route: AppRoute }[] = [
  { label: 'Product', route: '/product' },
  { label: 'Features', route: '/features' },
  { label: 'How It Works', route: '/how-it-works' },
  { label: 'Use Cases', route: '/use-cases' },
  { label: 'Integrations', route: '/integrations' },
  { label: 'Pricing', route: '/pricing' },
  { label: 'Documentation', route: '/docs' },
  { label: 'Blog', route: '/blog' },
  { label: 'About', route: '/about' },
  { label: 'Contact', route: '/contact' },
];

export const MarketingNavbar: React.FC<MarketingNavbarProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const { isAuthenticated, user, agency, dashboardRoute, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const handleLinkClick = (e: React.MouseEvent, route: AppRoute) => {
    e.preventDefault();
    setMobileOpen(false);
    setAccountMenuOpen(false);
    onNavigate(route);
  };

  const handleLogout = async () => {
    setMobileOpen(false);
    setAccountMenuOpen(false);
    await logout();
    onNavigate('/login');
  };

  const displayName = user?.name || 'Workspace User';
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'AD';

  return (
    <header className="sticky top-0 z-50 border-b border-[#363125] bg-[#211D10]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-6 px-6">
        {/* Brand Zone */}
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, '/')}
          className="group flex items-center whitespace-nowrap shrink-0"
          aria-label="Zevkar home"
        >
          <ZevkarLogo />
        </a>

        {/* Primary Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
          {DESKTOP_NAV_ITEMS.map((item) => {
            const active =
              currentRoute === item.route ||
              (item.route === '/docs' && currentRoute === '/developers') ||
              (item.route === '/blog' && currentRoute === '/resources');
            return (
              <a
                key={item.route}
                href={item.route}
                onClick={(e) => handleLinkClick(e, item.route)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
                  active
                    ? 'text-[#F0E9D9] border-[#A51D0B]'
                    : 'text-[#B8AE9B] border-transparent hover:text-[#F0E9D9] hover:border-[#363125]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Auth & CTA Actions */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {isAuthenticated ? (
            <>
              <a
                href={dashboardRoute}
                onClick={(e) => handleLinkClick(e, dashboardRoute)}
                className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span>Dashboard</span>
              </a>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-3 py-1.5 text-xs font-medium text-[#F0E9D9] transition-colors whitespace-nowrap"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded border border-[#363125] bg-[#202326] font-mono text-[10px] font-bold text-[#F0E9D9]">
                    {initials}
                  </span>
                  <span className="max-w-[130px] truncate">{displayName}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#B8AE9B]" aria-hidden="true" />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 rounded-xl border border-[#363125] bg-[#171A1B] p-3 shadow-2xl z-50 space-y-2"
                  >
                    <div className="border-b border-[#363125] pb-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F0E9D9] truncate">{displayName}</span>
                        {user?.role && (
                          <span className="font-mono text-[10px] text-[#B8AE9B]">
                            {user.role}
                          </span>
                        )}
                      </div>
                      {user?.email && (
                        <p className="text-[11px] text-[#B8AE9B] truncate">{user.email}</p>
                      )}
                      <p className="text-[11px] text-[#B8AE9B] truncate">
                        Org: <span className="text-[#F0E9D9]">{agency.name}</span>
                      </p>
                    </div>

                    <a
                      href={dashboardRoute}
                      role="menuitem"
                      onClick={(e) => handleLinkClick(e, dashboardRoute)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[#F0E9D9] hover:bg-[#202326] transition-colors"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                      <span>Go to Dashboard</span>
                    </a>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[#E88A7E] hover:bg-[#2B1513] transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <a
                href="/login"
                onClick={(e) => handleLinkClick(e, '/login')}
                className="text-sm font-medium text-[#B8AE9B] hover:text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0 px-2 py-2"
              >
                Login
              </a>
              <a
                href="/signup"
                onClick={(e) => handleLinkClick(e, '/signup')}
                className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
              >
                Start Free
              </a>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden flex h-10 w-10 items-center justify-center rounded-md border border-[#363125] bg-[#171A1B] text-[#F0E9D9]"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#363125] bg-[#171A1B] px-6 py-5 space-y-4">
          <nav className="grid grid-cols-2 gap-x-4 gap-y-1" aria-label="Mobile navigation">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = currentRoute === item.route;
              return (
                <a
                  key={item.route}
                  href={item.route}
                  onClick={(e) => handleLinkClick(e, item.route)}
                  className={`py-2.5 text-sm font-medium border-b border-[#363125]/60 ${
                    active ? 'text-[#F0E9D9]' : 'text-[#B8AE9B]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {isAuthenticated ? (
            <div className="pt-2 space-y-3">
              <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded border border-[#363125] bg-[#202326] text-[#F0E9D9] shrink-0">
                  <UserIcon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#F0E9D9] truncate">{displayName}</p>
                  <p className="text-[11px] text-[#B8AE9B] truncate">{agency.name}</p>
                </div>
              </div>
              <a
                href={dashboardRoute}
                onClick={(e) => handleLinkClick(e, dashboardRoute)}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span>Dashboard</span>
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#61231C] bg-[#2B1513] py-2.5 text-sm font-medium text-[#E88A7E]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="pt-2 flex flex-col gap-3">
              <a
                href="/login"
                onClick={(e) => handleLinkClick(e, '/login')}
                className="w-full rounded-md border border-[#363125] bg-[#211D10] py-2.5 text-center text-sm font-medium text-[#F0E9D9]"
              >
                Login
              </a>
              <a
                href="/signup"
                onClick={(e) => handleLinkClick(e, '/signup')}
                className="w-full rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-center text-sm font-semibold text-[#F0E9D9]"
              >
                Start Free
              </a>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
