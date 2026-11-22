import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePathname,
  normalizeDashboardTab,
  isDashboardRoute,
  isAuthRoute,
  isOnboardingRoute,
  extractBlogSlug,
  getDashboardRouteForRole,
  getDefaultTabForRole,
  resolveDashboardHref,
  resolveCtaRoute,
  resolveProtectedRouteAccess,
  getRouteMeta,
} from './router';

test('normalizePathname resolves valid Phase 8 routes and blog slugs accurately', () => {
  assert.equal(normalizePathname('/'), '/');
  assert.equal(normalizePathname('/product/'), '/product');
  assert.equal(normalizePathname('/features/'), '/features');
  assert.equal(normalizePathname('/integrations'), '/integrations');
  assert.equal(normalizePathname('/how-it-works/'), '/how-it-works');
  assert.equal(normalizePathname('/use-cases'), '/use-cases');
  assert.equal(normalizePathname('/pricing'), '/pricing');
  assert.equal(normalizePathname('/docs/'), '/docs');
  assert.equal(normalizePathname('/blog'), '/blog');
  assert.equal(normalizePathname('/blog/idempotent-workflow-recovery-sha256'), '/blog');
  assert.equal(extractBlogSlug('/blog/idempotent-workflow-recovery-sha256'), 'idempotent-workflow-recovery-sha256');
  assert.equal(extractBlogSlug('/blog'), null);
  assert.equal(normalizePathname('/developers/'), '/developers');
  assert.equal(normalizePathname('/privacy/'), '/privacy');
  assert.equal(normalizePathname('/terms'), '/terms');
  assert.equal(normalizePathname('/cookies'), '/cookies');
  assert.equal(normalizePathname('/reset-password'), '/reset-password');
  assert.equal(normalizePathname('/verify-email'), '/verify-email');
  assert.equal(normalizePathname('/accept-invite'), '/accept-invite');
  assert.equal(normalizePathname('/onboarding'), '/onboarding');
  assert.equal(normalizePathname('/dashboard'), '/dashboard');
  assert.equal(normalizePathname('/unknown-route'), '/');
});

test('route classification helpers identify dashboard, auth, and onboarding routes accurately', () => {
  assert.equal(isDashboardRoute('/dashboard'), true);
  assert.equal(isDashboardRoute('/product'), false);
  assert.equal(isOnboardingRoute('/onboarding'), true);
  assert.equal(isOnboardingRoute('/dashboard'), false);
  assert.equal(isAuthRoute('/login'), true);
  assert.equal(isAuthRoute('/signup'), true);
  assert.equal(isAuthRoute('/forgot-password'), true);
  assert.equal(isAuthRoute('/reset-password'), true);
  assert.equal(isAuthRoute('/verify-email'), true);
  assert.equal(isAuthRoute('/accept-invite'), true);
  assert.equal(isAuthRoute('/pricing'), false);
});

test('role-based dashboard route helpers resolve authenticated dashboard targets without pointing to public homepage', () => {
  for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const) {
    assert.equal(getDashboardRouteForRole(role), '/dashboard');
    assert.notEqual(getDashboardRouteForRole(role), '/');
    assert.equal(getDefaultTabForRole(role), 'overview');
  }
  assert.equal(normalizeDashboardTab('incidents'), 'incidents');
  assert.equal(normalizeDashboardTab('alerts'), 'alerts');
  assert.equal(normalizeDashboardTab('invalid-tab'), 'overview');
  assert.equal(resolveDashboardHref('ADMIN', 'overview'), '/dashboard');
  assert.equal(resolveDashboardHref('MEMBER', 'incidents'), '/dashboard?tab=incidents');
  assert.equal(resolveDashboardHref('ADMIN', 'alerts'), '/dashboard?tab=alerts');
});

test('resolveProtectedRouteAccess redirects unauthenticated dashboard/onboarding access to login', () => {
  const unauthDash = resolveProtectedRouteAccess({
    pathname: '/dashboard',
    search: '?tab=incidents',
    isAuthenticated: false,
  });
  assert.equal(unauthDash.route, '/login');
  assert.equal(unauthDash.shouldRedirect, true);

  const unauthOnboard = resolveProtectedRouteAccess({
    pathname: '/onboarding',
    isAuthenticated: false,
  });
  assert.equal(unauthOnboard.route, '/login');
  assert.equal(unauthOnboard.shouldRedirect, true);

  const authOnboard = resolveProtectedRouteAccess({
    pathname: '/onboarding',
    isAuthenticated: true,
    userRole: 'OWNER',
  });
  assert.equal(authOnboard.route, '/onboarding');
  assert.equal(authOnboard.shouldRedirect, false);

  const authDash = resolveProtectedRouteAccess({
    pathname: '/dashboard',
    search: '?tab=incidents',
    isAuthenticated: true,
    userRole: 'ADMIN',
  });
  assert.equal(authDash.route, '/dashboard');
  assert.equal(authDash.tab, 'incidents');
  assert.equal(authDash.shouldRedirect, false);

  const demoQueryAccess = resolveProtectedRouteAccess({
    pathname: '/',
    search: '?autostart=1',
    isAuthenticated: false,
    userRole: 'OWNER',
  });
  assert.equal(demoQueryAccess.route, '/');
  assert.equal(demoQueryAccess.shouldRedirect, false);

  const publicHome = resolveProtectedRouteAccess({
    pathname: '/',
    isAuthenticated: true,
    userRole: 'OWNER',
  });
  assert.equal(publicHome.route, '/');
  assert.equal(publicHome.shouldRedirect, false);

  assert.equal(resolveCtaRoute(true, 'ADMIN'), '/dashboard');
  assert.equal(resolveCtaRoute(true, 'MEMBER'), '/dashboard');
  assert.equal(resolveCtaRoute(false, null), '/signup');
});

test('getRouteMeta returns unique Zevkar AI titles and descriptions per route', () => {
  const homeMeta = getRouteMeta('/');
  const devMeta = getRouteMeta('/developers');
  const docsMeta = getRouteMeta('/docs');
  const blogMeta = getRouteMeta('/blog');
  const privacyMeta = getRouteMeta('/privacy');
  const cookiesMeta = getRouteMeta('/cookies');

  assert.ok(homeMeta.title.includes('Zevkar AI'));
  assert.ok(devMeta.title.includes('Zevkar AI'));
  assert.ok(docsMeta.title.includes('Documentation'));
  assert.ok(blogMeta.title.includes('Blog'));
  assert.ok(privacyMeta.title.includes('Privacy Policy'));
  assert.ok(cookiesMeta.title.includes('Cookie Policy'));
  assert.ok(devMeta.description.length > 40);
});
