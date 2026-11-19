import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_STEPS,
  clampOnboardingStep,
  computeGettingStartedChecklist,
  createEmptyOnboardingState,
  getOnboardingPlatformConfig,
  resolvePostAuthDestination,
  validateOnboardingStep,
} from './onboarding';

describe('Onboarding 8-Step Configuration & Validation', () => {
  it('defines the exact 8-step guided onboarding sequence', () => {
    assert.equal(ONBOARDING_STEPS.length, 8);
    assert.deepEqual(
      ONBOARDING_STEPS.map((s) => s.key),
      ['welcome', 'organization', 'client', 'platform', 'integration', 'test', 'sync', 'complete']
    );
  });

  it('clamps step indices safely between 1 and 8', () => {
    assert.equal(clampOnboardingStep(0), 1);
    assert.equal(clampOnboardingStep(-4), 1);
    assert.equal(clampOnboardingStep(4.9), 4);
    assert.equal(clampOnboardingStep(99), 8);
  });

  it('validates organization details cleanly on step 2', () => {
    assert.equal(validateOnboardingStep(2, { organizationName: 'A', contactEmail: 'ops@acme.com' }).valid, false);
    assert.equal(validateOnboardingStep(2, { organizationName: 'Acme Labs', contactEmail: 'invalid-email' }).valid, false);
    assert.equal(validateOnboardingStep(2, { organizationName: 'Acme Labs', contactEmail: 'ops@acme.com' }).valid, true);
  });

  it('validates client details cleanly on step 3', () => {
    assert.equal(validateOnboardingStep(3, { clientName: 'X', clientEmail: 'ops@client.com' }).valid, false);
    assert.equal(validateOnboardingStep(3, { clientName: 'Northstar Ops', clientEmail: 'bad' }).valid, false);
    assert.equal(validateOnboardingStep(3, { clientName: 'Northstar Ops', companyName: 'Northstar Inc', clientEmail: 'ops@northstar.io' }).valid, true);
  });

  it('validates integration URL format on step 5', () => {
    assert.equal(
      validateOnboardingStep(5, { platform: 'n8n', integrationName: 'Prod', instanceUrl: '' }).valid,
      false
    );
    assert.equal(
      validateOnboardingStep(5, { platform: 'n8n', integrationName: 'Prod', instanceUrl: 'ftp://bad.host' }).valid,
      false
    );
    assert.equal(
      validateOnboardingStep(5, { platform: 'n8n', integrationName: 'Prod', instanceUrl: 'https://n8n.acme.com/api/v1' }).valid,
      true
    );
    assert.equal(
      validateOnboardingStep(5, { platform: 'custom_python', integrationName: 'FastAPI Listener', instanceUrl: '' }).valid,
      true
    );
  });

  it('resolves post-auth destination to /onboarding when onboarding is incomplete', () => {
    assert.deepEqual(
      resolvePostAuthDestination({
        isAuthenticated: true,
        onboardingCompleted: false,
        role: 'OWNER',
      }),
      { route: '/onboarding' }
    );
    assert.deepEqual(
      resolvePostAuthDestination({
        isAuthenticated: true,
        onboardingCompleted: true,
        role: 'ADMIN',
        pendingTab: 'incidents',
      }),
      { route: '/dashboard', tab: 'incidents' }
    );
  });

  it('computes honest zero progress for a brand-new organization without fabricated metrics', () => {
    const emptyState = createEmptyOnboardingState('agency_new_1', 'New Org', 'founder@neworg.io');
    const checklist = computeGettingStartedChecklist({
      onboardingState: emptyState,
      clients: [],
      integrations: [],
      workflows: [],
      executions: [],
      incidents: [],
      notificationPreferences: [],
    });
    assert.equal(checklist.completedCount, 0);
    assert.equal(checklist.totalCount, 7);
    assert.equal(checklist.progressPercent, 0);
  });

  it('returns platform metadata accurately for supported platforms', () => {
    const n8n = getOnboardingPlatformConfig('n8n');
    const custom = getOnboardingPlatformConfig('custom_python');
    assert.equal(n8n.requiresApiKey, true);
    assert.equal(custom.verificationMode, 'webhook-listener');
  });
});
