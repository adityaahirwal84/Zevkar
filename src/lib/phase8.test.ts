import test from 'node:test';
import assert from 'node:assert/strict';
import { getPricingCatalog } from './pricing-config';
import { INTEGRATION_DIRECTORY } from './integrations-catalog';
import { DOCUMENTATION_SECTIONS } from './docs-content';
import { BLOG_ARTICLES, filterBlogArticles } from './blog-content';

test('getPricingCatalog exposes 4 configurable plans with transparent self-hosted notice', () => {
  const catalog = getPricingCatalog();
  assert.equal(catalog.plans.length, 4);
  assert.equal(catalog.currency, 'USD');
  assert.ok(catalog.billingModeNotice.toLowerCase().includes('configurable'));

  const starter = catalog.plans.find((p) => p.id === 'starter');
  const enterprise = catalog.plans.find((p) => p.id === 'enterprise');
  assert.ok(starter && typeof starter.monthlyPriceUsd === 'number');
  assert.ok(enterprise && enterprise.monthlyPriceUsd === null);
});

test('INTEGRATION_DIRECTORY maintains honest availability statuses without fabricated live connectors', () => {
  const available = INTEGRATION_DIRECTORY.filter((i) => i.availability === 'Available');
  const inDev = INTEGRATION_DIRECTORY.filter((i) => i.availability === 'In Development');
  const planned = INTEGRATION_DIRECTORY.filter((i) => i.availability === 'Planned');

  assert.ok(available.some((i) => i.id === 'n8n'));
  assert.ok(available.some((i) => i.id === 'webhooks'));
  assert.ok(inDev.some((i) => i.id === 'zapier'));
  assert.ok(inDev.some((i) => i.id === 'make'));
  assert.ok(planned.some((i) => i.id === 'slack-pagerduty'));
});

test('DOCUMENTATION_SECTIONS covers all 9 Phase 8 documentation guides', () => {
  assert.equal(DOCUMENTATION_SECTIONS.length, 9);
  const ids = new Set(DOCUMENTATION_SECTIONS.map((s) => s.id));
  assert.ok(ids.has('getting-started'));
  assert.ok(ids.has('connecting-n8n'));
  assert.ok(ids.has('recovery-and-approvals'));
  assert.ok(ids.has('security'));
});

test('BLOG_ARTICLES and filterBlogArticles support category and search queries accurately', () => {
  assert.ok(BLOG_ARTICLES.length >= 4);
  const all = filterBlogArticles('All', '');
  assert.equal(all.length, BLOG_ARTICLES.length);

  const safetyOnly = filterBlogArticles('Safety & Recovery', '');
  assert.ok(safetyOnly.length >= 1);
  assert.ok(safetyOnly.every((a) => a.category === 'Safety & Recovery'));

  const idempotentMatch = filterBlogArticles('All', 'SHA-256');
  assert.ok(idempotentMatch.some((a) => a.slug === 'idempotent-workflow-recovery-sha256'));
});
