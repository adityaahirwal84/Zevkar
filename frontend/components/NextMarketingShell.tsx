'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LayoutDashboard, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

interface NextMarketingShellProps {
  activePath: string;
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/product', label: 'Product' },
  { href: '/features', label: 'Features' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
];

const MOBILE_NAV_LINKS = [
  { href: '/product', label: 'Product' },
  { href: '/features', label: 'Features' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function DoctorBrandMark({
  wordmark = 'Zevkar',
}: {
  compact?: boolean;
  showDomainSuffix?: boolean;
  wordmark?: 'Zevkar' | 'Zevkar AI';
}) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        className="h-8 w-8 sm:h-9 sm:w-9 aspect-square shrink-0 object-contain select-none"
      />
      <span className="font-bold text-base tracking-tight text-[#F0E9D9] whitespace-nowrap">
        {wordmark}
      </span>
    </span>
  );
}

export const ZevkarBrandMark = DoctorBrandMark;
export const DeltaBrandMark = DoctorBrandMark;

export function NextMarketingShell({ activePath, children }: NextMarketingShellProps) {
  const router = useRouter();
  const { isAuthenticated, user, orgName, dashboardRoute, logout } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const displayName = user?.name || 'Workspace User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'AD';

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMobileOpen(false);
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#211D10] text-[#F0E9D9]">
      <header className="sticky top-0 z-50 border-b border-[#363125] bg-[#211D10]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-8 px-6">
          <Link href="/" aria-label="Zevkar home" className="flex items-center whitespace-nowrap shrink-0">
            <DoctorBrandMark />
          </Link>

          <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium whitespace-nowrap shrink-0 pb-0.5 border-b transition-colors ${
                  activePath === item.href
                    ? 'text-[#F0E9D9] border-[#A51D0B]'
                    : 'text-[#B8AE9B] border-transparent hover:text-[#F0E9D9]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <>
                <Link
                  href={dashboardRoute}
                  className="inline-flex items-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  <span>Dashboard</span>
                </Link>

                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((prev) => !prev)}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    className="inline-flex items-center gap-2 rounded-md border border-[#363125] bg-[#171A1B] hover:border-[#B8AE9B] px-3 py-1.5 text-xs font-medium text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
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
                        {user?.email && <p className="text-[11px] text-[#B8AE9B] truncate">{user.email}</p>}
                        {orgName && (
                          <p className="text-[11px] text-[#B8AE9B] truncate">
                            Org: <span className="text-[#F0E9D9]">{orgName}</span>
                          </p>
                        )}
                      </div>
                      <Link
                        href={dashboardRoute}
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[#F0E9D9] hover:bg-[#202326] transition-colors"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                        <span>Go to Dashboard</span>
                      </Link>
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
                <Link
                  href="/login"
                  className="text-sm font-medium text-[#B8AE9B] hover:text-[#F0E9D9] px-2 py-2 whitespace-nowrap shrink-0"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-[#A51D0B] hover:bg-[#C52A18] px-4 py-2 text-sm font-semibold text-[#F0E9D9] transition-colors whitespace-nowrap shrink-0"
                >
                  Start Free
                </Link>
              </>
            )}
          </div>

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

        {mobileOpen && (
          <div className="lg:hidden border-t border-[#363125] bg-[#171A1B] px-6 py-5 space-y-4">
            <nav className="grid grid-cols-2 gap-x-4 gap-y-1" aria-label="Mobile navigation">
              {MOBILE_NAV_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`py-2.5 text-sm font-medium border-b border-[#363125]/60 ${
                    activePath === item.href ? 'text-[#F0E9D9]' : 'text-[#B8AE9B]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {isAuthenticated ? (
              <div className="pt-2 space-y-3">
                <div className="rounded-lg border border-[#363125] bg-[#211D10] p-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-[#363125] bg-[#202326] text-[#F0E9D9] shrink-0">
                    <UserIcon className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#F0E9D9] truncate">{displayName}</p>
                    {orgName && <p className="text-[11px] text-[#B8AE9B] truncate">{orgName}</p>}
                  </div>
                </div>
                <Link
                  href={dashboardRoute}
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-sm font-semibold text-[#F0E9D9]"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  <span>Dashboard</span>
                </Link>
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
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-md border border-[#363125] bg-[#211D10] py-2.5 text-center text-sm font-medium text-[#F0E9D9]"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-md bg-[#A51D0B] hover:bg-[#C52A18] py-2.5 text-center text-sm font-semibold text-[#F0E9D9]"
                >
                  Start Free
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#363125] bg-[#171A1B] text-[#B8AE9B]">
        <div className="mx-auto max-w-[1320px] px-6 py-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 text-xs">
          <div className="space-y-2">
            <DoctorBrandMark wordmark="Zevkar AI" />
            <p className="font-medium text-[#F0E9D9]">AI-Powered Automation Monitoring, Diagnosis &amp; Recovery.</p>
            <p className="text-[11px] text-[#B8AE9B]">
              © {new Date().getFullYear()} Zevkar AI. All rights reserved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <Link href="/product" className="hover:text-[#F0E9D9]">Product</Link>
            <Link href="/features" className="hover:text-[#F0E9D9]">Features</Link>
            <Link href="/integrations" className="hover:text-[#F0E9D9]">Integrations</Link>
            <Link href="/how-it-works" className="hover:text-[#F0E9D9]">How It Works</Link>
            <Link href="/use-cases" className="hover:text-[#F0E9D9]">Use Cases</Link>
            <Link href="/pricing" className="hover:text-[#F0E9D9]">Pricing</Link>
            <Link href="/docs" className="hover:text-[#F0E9D9]">Docs</Link>
            <Link href="/blog" className="hover:text-[#F0E9D9]">Blog</Link>
            <Link href="/about" className="hover:text-[#F0E9D9]">About</Link>
            <Link href="/contact" className="hover:text-[#F0E9D9]">Contact</Link>
            <Link href="/privacy" className="hover:text-[#F0E9D9]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#F0E9D9]">Terms</Link>
            <Link href="/cookies" className="hover:text-[#F0E9D9]">Cookies</Link>
            <Link href={isAuthenticated ? dashboardRoute : '/login'} className="hover:text-[#F0E9D9]">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
