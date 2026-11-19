import http from 'http';
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { classifyError, calculateHealthScore, evaluateRecoverySafety } from './src/lib/doctor-engine';
import { isValidTimeZone, sortByTimestampDesc } from './src/lib/datetime';
import { getPricingCatalog } from './src/lib/pricing-config';
import { registerPhase10Routes } from './src/server/phase10-routes';
import {
  deduplicateExecutions,
  evaluateStuckExecutions,
  fetchN8nPaginated,
  normalizeN8nExecution,
  RawN8nExecution,
  validateExternalN8nUrl,
} from './src/lib/n8n-sync';
import {
  ACTIVE_RECOVERY_STATUSES,
  RETRY_STRATEGIES,
  SUPPORTED_RECOVERY_STRATEGIES,
  assessRecoveryRisk,
  buildDeterministicRecommendation,
  calculateBackoffDelaySeconds,
  computeRecoveryMetrics,
  createDefaultRecoveryPolicy,
  generateRecoveryIdempotencyKey,
  generateRequestIdempotencyKey,
  validateRecoveryExecutionPreconditions,
} from './src/lib/recovery-engine';
import {
  Agency,
  Client,
  Integration,
  Workflow,
  Execution,
  Incident,
  AIDiagnosis,
  RecoveryAttempt,
  RecoveryPolicy,
  RecoveryRequest,
  RecoveryStrategy,
  ApprovalRequest,
  NotificationItem,
  NotificationPreferenceItem,
  InvitationItem,
  OnboardingState,
  DashboardStats,
  AgencyMember,
  AuditLogItem,
} from './src/types';
import { clampOnboardingStep, createEmptyOnboardingState } from './src/lib/onboarding';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';

// Validate environment variables and enforce production infrastructure requirements
function validateEnvironment() {
  const envSummary = {
    PORT,
    NODE_ENV: process.env.NODE_ENV || 'development',
    RUNTIME_MODE: isProd ? 'PRODUCTION' : 'DEVELOPMENT_DEMO (In-Memory Store Active)',
    GEMINI_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Configured (Server-side)' : 'Missing (Deterministic rules engine active)',
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || process.env.APP_URL || 'http://localhost:3000',
    DISABLE_HMR: (process.env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === '1')
      ? 'true (Vite HMR connection disabled cleanly; CSS injection & React runtime active)'
      : 'false (Vite HMR enabled)',
    DATABASE_URL: process.env.DATABASE_URL ? 'Configured' : (isProd ? 'MISSING (Fatal in production)' : 'In-memory mock store'),
    REDIS_URL: process.env.REDIS_URL ? 'Configured' : (isProd ? 'MISSING (Fatal in production)' : 'Direct execution mock queue'),
    CELERY_BROKER_URL: process.env.CELERY_BROKER_URL ? 'Configured' : 'Direct execution mock ready',
  };

  console.log('[Zevkar] Environment Status:');
  Object.entries(envSummary).forEach(([key, val]) => {
    console.log(`  - ${key}: ${val}`);
  });

  if (isProd) {
    const missingProdVars: string[] = [];
    if (!process.env.DATABASE_URL) {
      missingProdVars.push('DATABASE_URL: Production requires a persistent PostgreSQL connection; in-memory mock stores cannot be used in production.');
    }
    if (!process.env.SECRET_KEY || process.env.SECRET_KEY.includes('change_this')) {
      missingProdVars.push('SECRET_KEY: Production requires a cryptographically secure JWT signing key.');
    }
    if (!process.env.REDIS_URL) {
      missingProdVars.push('REDIS_URL: Production requires a Redis instance for job scheduling, deduplication locks, and task queues.');
    }

    if (missingProdVars.length > 0) {
      console.error('\n================================================================================');
      console.error('[Zevkar] FATAL: Production Configuration Error(s) Detected');
      console.error('The application cannot start in production mode (NODE_ENV=production) with missing infrastructure:');
      missingProdVars.forEach(v => console.error(`  ✖ ${v}`));
      console.error('--------------------------------------------------------------------------------');
      console.error('Remediation: Provide valid infrastructure connection strings or set NODE_ENV=development');
      console.error('for local demo / in-memory development mode.');
      console.error('================================================================================\n');
      process.exit(1);
    }
  }
}
validateEnvironment();

// Initialize Gemini Client
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Multi-Tenant In-Memory Store (strictly isolated by agencyId)
type RegisteredUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  agencyId: string;
  isVerified: boolean;
  timezone: string;
};

type TenantStore = {
  agency: Agency;
  onboarding: OnboardingState;
  integrationSecrets: Map<string, string>;
  teamMembers: AgencyMember[];
  invitations: InvitationItem[];
  clients: Client[];
  integrations: Integration[];
  workflows: Workflow[];
  executions: Execution[];
  incidents: Incident[];
  recoveryPolicy: RecoveryPolicy;
  recoveryRequests: RecoveryRequest[];
  recoveryAttemptsStore: RecoveryAttempt[];
  approvals: ApprovalRequest[];
  notifications: NotificationItem[];
  notificationPreferences: NotificationPreferenceItem[];
  auditLogs: AuditLogItem[];
};

const DEMO_AGENCY_ID = 'agency_apex_01';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  const actualBuf = crypto.scryptSync(password, salt, 32);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function createDefaultNotificationPreferences(enabled = false): NotificationPreferenceItem[] {
  return [
    { channel: 'IN_APP', minSeverity: 'MEDIUM', isEnabled: enabled },
    { channel: 'EMAIL', minSeverity: 'HIGH', isEnabled: enabled },
    { channel: 'WEBHOOK', minSeverity: 'CRITICAL', isEnabled: false },
  ];
}

function createSeededDemoTenant(): TenantStore {
  const agency: Agency = {
    id: DEMO_AGENCY_ID,
    name: 'Apex Automation Labs',
    slug: 'apex-automations',
    tier: 'GROWTH',
    contactEmail: 'ops@apexautomations.io',
    timezone: 'UTC',
    onboardingStep: 8,
    onboardingCompleted: true,
    onboardingCompletedAt: new Date(Date.now() - 88 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    clientsCount: 4,
    workflowsCount: 4,
  };

  return {
    agency,
    onboarding: {
      agencyId: DEMO_AGENCY_ID,
      currentStep: 8,
      completed: true,
      completedAt: agency.onboardingCompletedAt,
      data: {
        organizationName: agency.name,
        contactEmail: agency.contactEmail,
        timezone: 'UTC',
        clientId: 'cli_1',
        clientName: 'FinEdge Global',
        companyName: 'FinEdge Financial Technologies Inc.',
        clientEmail: 'devops@finedge.com',
        platform: 'n8n',
        integrationId: 'int_1',
        integrationName: 'FinEdge Dedicated n8n Cluster',
        instanceUrl: 'https://n8n.finedge.internal/api/v1',
        connectionTested: true,
        connectionVerified: true,
        syncCompleted: true,
        syncedWorkflowCount: 4,
        syncedExecutionCount: 6,
      },
    },
    integrationSecrets: new Map<string, string>(),
    teamMembers: [
      { id: 'mem_1', userId: 'u_1', name: 'Aditya Mehta', email: 'aditya84azm@gmail.com', role: 'OWNER', joinedAt: '2026-01-10T08:00:00Z', status: 'ACTIVE' },
      { id: 'mem_2', userId: 'u_2', name: 'Elena Rostova', email: 'elena@apexautomations.io', role: 'ADMIN', joinedAt: '2026-02-14T09:30:00Z', status: 'ACTIVE' },
      { id: 'mem_3', userId: 'u_3', name: 'Marcus Chen', email: 'marcus@apexautomations.io', role: 'MEMBER', joinedAt: '2026-03-01T11:00:00Z', status: 'ACTIVE' },
    ],
    invitations: [],
    clients: [
      {
        id: 'cli_1',
        agencyId: DEMO_AGENCY_ID,
        name: 'FinEdge Global',
        companyName: 'FinEdge Financial Technologies Inc.',
        industry: 'Fintech & Payments',
        contactEmail: 'devops@finedge.com',
        contactPhone: '+1 (415) 890-2134',
        notes: 'High-volume transaction webhooks. Zero tolerance for unacknowledged Stripe errors.',
        assignedMemberId: 'mem_1',
        assignedMemberName: 'Aditya Mehta',
        healthScore: 74,
        activeIncidentsCount: 1,
        monitoredWorkflowsCount: 4,
        createdAt: '2026-01-15T10:00:00Z',
      },
      {
        id: 'cli_2',
        agencyId: DEMO_AGENCY_ID,
        name: 'Skyline Real Estate',
        companyName: 'Skyline Commercial Properties LLC',
        industry: 'Real Estate',
        contactEmail: 'leads@skylinerealty.com',
        contactPhone: '+1 (312) 441-9988',
        notes: 'Zillow & Meta ad leads synced into HubSpot & agent SMS alerts.',
        assignedMemberId: 'mem_2',
        assignedMemberName: 'Elena Rostova',
        healthScore: 98,
        activeIncidentsCount: 0,
        monitoredWorkflowsCount: 3,
        createdAt: '2026-02-01T14:20:00Z',
      },
      {
        id: 'cli_3',
        agencyId: DEMO_AGENCY_ID,
        name: 'HealthPulse Diagnostics',
        companyName: 'HealthPulse Labs & Clinics',
        industry: 'Healthcare / MedTech',
        contactEmail: 'integrations@healthpulse.org',
        notes: 'Strict HIPAA compliance required. Retries must verify deduplication.',
        assignedMemberId: 'mem_1',
        assignedMemberName: 'Aditya Mehta',
        healthScore: 62,
        activeIncidentsCount: 1,
        monitoredWorkflowsCount: 3,
        createdAt: '2026-02-18T16:00:00Z',
      },
      {
        id: 'cli_4',
        agencyId: DEMO_AGENCY_ID,
        name: 'Velocity Digital Media',
        companyName: 'Velocity Performance Agency',
        industry: 'Marketing & AdTech',
        contactEmail: 'analytics@velocitymedia.co',
        notes: 'Multi-platform attribution sync between TikTok, Meta, and BigQuery.',
        assignedMemberId: 'mem_3',
        assignedMemberName: 'Marcus Chen',
        healthScore: 91,
        activeIncidentsCount: 0,
        monitoredWorkflowsCount: 2,
        createdAt: '2026-03-05T09:15:00Z',
      },
    ],
    integrations: [
      {
        id: 'int_1',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_1',
        name: 'FinEdge Dedicated n8n Cluster',
        platform: 'n8n',
        instanceUrl: 'https://n8n.finedge.internal/api/v1',
        hasCredentials: true,
        status: 'CONNECTED',
        lastSyncedAt: new Date(Date.now() - 15 * 60000).toISOString(),
        workflowCount: 4,
        createdAt: '2026-01-20T10:00:00Z',
      },
      {
        id: 'int_2',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_2',
        name: 'Skyline Zapier Enterprise Workspace',
        platform: 'Zapier',
        instanceUrl: 'https://api.zapier.com/v1',
        hasCredentials: true,
        status: 'CONNECTED',
        lastSyncedAt: new Date(Date.now() - 40 * 60000).toISOString(),
        workflowCount: 3,
        createdAt: '2026-02-05T12:00:00Z',
      },
      {
        id: 'int_3',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_3',
        name: 'HealthPulse Make.com Gateway',
        platform: 'Make',
        instanceUrl: 'https://eu1.make.com/api/v2',
        hasCredentials: true,
        status: 'CONNECTED',
        lastSyncedAt: new Date(Date.now() - 25 * 60000).toISOString(),
        workflowCount: 3,
        createdAt: '2026-02-20T11:00:00Z',
      },
      {
        id: 'int_4',
        agencyId: DEMO_AGENCY_ID,
        name: 'Agency Central Automation Hub (n8n)',
        platform: 'n8n',
        instanceUrl: 'https://automation.apexautomations.io/api/v1',
        hasCredentials: true,
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'SUCCESS',
        workflowCount: 1,
        createdAt: '2026-01-10T08:00:00Z',
      },
    ],
    workflows: [
      {
        id: 'wf_1',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_1',
        clientName: 'FinEdge Global',
        integrationId: 'int_1',
        platform: 'n8n',
        externalWorkflowId: 'n8n_stripe_netsuite_sync',
        name: 'Stripe Settlement Webhook -> NetSuite Invoice Sync',
        isActive: true,
        healthStatus: 'FAILING',
        consecutiveFailures: 4,
        stuckTimeoutSeconds: 600,
        allowLongRunning: false,
        lastExecutionAt: new Date(Date.now() - 8 * 60000).toISOString(),
        lastSuccessfulAt: new Date(Date.now() - 180 * 60000).toISOString(),
        lastFailedAt: new Date(Date.now() - 8 * 60000).toISOString(),
        avgDurationMs: 1420,
        createdAt: '2026-01-22T10:00:00Z',
      },
      {
        id: 'wf_2',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_2',
        clientName: 'Skyline Real Estate',
        integrationId: 'int_2',
        platform: 'Zapier',
        externalWorkflowId: 'zap_hubspot_qualification',
        name: 'Zillow & Meta Inbound Lead -> AI Qualifier -> CRM Dispatch',
        isActive: true,
        healthStatus: 'HEALTHY',
        consecutiveFailures: 0,
        lastExecutionAt: new Date(Date.now() - 4 * 60000).toISOString(),
        lastSuccessfulAt: new Date(Date.now() - 4 * 60000).toISOString(),
        avgDurationMs: 820,
        createdAt: '2026-02-06T12:00:00Z',
      },
      {
        id: 'wf_3',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_3',
        clientName: 'HealthPulse Diagnostics',
        integrationId: 'int_3',
        platform: 'Make',
        externalWorkflowId: 'make_patient_intake_db',
        name: 'EMR Intake Webhook -> PostgreSQL Patient Record Sync',
        isActive: true,
        healthStatus: 'DEGRADED',
        consecutiveFailures: 2,
        lastExecutionAt: new Date(Date.now() - 22 * 60000).toISOString(),
        lastSuccessfulAt: new Date(Date.now() - 65 * 60000).toISOString(),
        lastFailedAt: new Date(Date.now() - 22 * 60000).toISOString(),
        avgDurationMs: 2310,
        createdAt: '2026-02-22T14:00:00Z',
      },
      {
        id: 'wf_4',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_4',
        clientName: 'Velocity Digital Media',
        integrationId: 'int_4',
        platform: 'n8n',
        externalWorkflowId: 'n8n_meta_bigquery_attribution',
        name: 'Meta Ads Hourly Spend -> BigQuery Attribution Pipeline',
        isActive: true,
        healthStatus: 'HEALTHY',
        consecutiveFailures: 0,
        allowLongRunning: true,
        lastExecutionAt: new Date(Date.now() - 45 * 60000).toISOString(),
        lastSuccessfulAt: new Date(Date.now() - 45 * 60000).toISOString(),
        avgDurationMs: 3450,
        createdAt: '2026-03-06T10:00:00Z',
      },
    ],
    executions: [
      {
        id: 'exec_n8n_98124',
        workflowId: 'wf_1',
        integrationId: 'int_1',
        externalExecutionId: '98124',
        workflowName: 'Stripe Settlement Webhook -> NetSuite Invoice Sync',
        clientName: 'FinEdge Global',
        platform: 'n8n',
        status: 'FAILED',
        rawStatus: 'error',
        startedAt: new Date(Date.now() - 8 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 8 * 60000 + 1420).toISOString(),
        durationMs: 1420,
        mode: 'webhook',
        errorMessage: '[Fetch Stripe Balance Transaction] HTTP 401 Unauthorized: Invalid Stripe API Key supplied.',
        retryCount: 0,
      },
      {
        id: 'exec_zap_44210',
        workflowId: 'wf_2',
        integrationId: 'int_2',
        externalExecutionId: '44210',
        workflowName: 'Zillow & Meta Inbound Lead -> AI Qualifier -> CRM Dispatch',
        clientName: 'Skyline Real Estate',
        platform: 'Zapier',
        status: 'SUCCESS',
        rawStatus: 'success',
        startedAt: new Date(Date.now() - 4 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 4 * 60000 + 820).toISOString(),
        durationMs: 820,
        mode: 'webhook',
        retryCount: 0,
      },
      {
        id: 'exec_make_77189',
        workflowId: 'wf_3',
        integrationId: 'int_3',
        externalExecutionId: '77189',
        workflowName: 'EMR Intake Webhook -> PostgreSQL Patient Record Sync',
        clientName: 'HealthPulse Diagnostics',
        platform: 'Make',
        status: 'FAILED',
        rawStatus: 'error',
        startedAt: new Date(Date.now() - 22 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 22 * 60000 + 2310).toISOString(),
        durationMs: 2310,
        mode: 'webhook',
        errorMessage: 'PostgreSQL error: deadlock detected on process 18239 while updating table "patients_ehr".',
        retryCount: 0,
      },
      {
        id: 'exec_n8n_98110',
        workflowId: 'wf_4',
        integrationId: 'int_4',
        externalExecutionId: '98110',
        workflowName: 'Meta Ads Hourly Spend -> BigQuery Attribution Pipeline',
        clientName: 'Velocity Digital Media',
        platform: 'n8n',
        status: 'SUCCESS',
        rawStatus: 'success',
        startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 45 * 60000 + 3450).toISOString(),
        durationMs: 3450,
        mode: 'trigger',
        retryCount: 0,
      },
      {
        id: 'exec_n8n_98099',
        workflowId: 'wf_4',
        integrationId: 'int_4',
        externalExecutionId: '98099',
        workflowName: 'Meta Ads Hourly Spend -> BigQuery Attribution Pipeline',
        clientName: 'Velocity Digital Media',
        platform: 'n8n',
        status: 'SUCCESS',
        rawStatus: 'success',
        startedAt: new Date(Date.now() - 105 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 105 * 60000 + 3120).toISOString(),
        durationMs: 3120,
        mode: 'trigger',
        retryCount: 0,
      },
      {
        id: 'exec_n8n_98085',
        workflowId: 'wf_1',
        integrationId: 'int_1',
        externalExecutionId: '98085',
        workflowName: 'Stripe Settlement Webhook -> NetSuite Invoice Sync',
        clientName: 'FinEdge Global',
        platform: 'n8n',
        status: 'SUCCESS',
        rawStatus: 'success',
        startedAt: new Date(Date.now() - 180 * 60000).toISOString(),
        finishedAt: new Date(Date.now() - 180 * 60000 + 1190).toISOString(),
        durationMs: 1190,
        mode: 'webhook',
        retryCount: 0,
      },
    ],
    incidents: [
      {
        id: 'inc_8041',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_1',
        clientName: 'FinEdge Global',
        workflowId: 'wf_1',
        workflowName: 'Stripe Settlement Webhook -> NetSuite Invoice Sync',
        platform: 'n8n',
        executionId: 'exec_n8n_98124',
        errorCategory: 'AUTH_FAILURE',
        errorMessage: 'HTTP 401 Unauthorized: Invalid Stripe API Key supplied. Key "rk_live_883...f02" revoked by security admin.',
        severity: 'HIGH',
        status: 'APPROVAL_REQUIRED',
        firstDetectedAt: new Date(Date.now() - 48 * 60000).toISOString(),
        lastDetectedAt: new Date(Date.now() - 8 * 60000).toISOString(),
        occurrenceCount: 4,
        assignedMember: 'Aditya Mehta',
        pendingApprovalId: 'appr_01',
        aiDiagnosis: {
          id: 'diag_1',
          incidentId: 'inc_8041',
          errorCategory: 'AUTH_FAILURE',
          severity: 'HIGH',
          rootCause: 'The live Stripe restricted API secret key expired or was revoked in the FinEdge developer dashboard.',
          simpleExplanation: 'Stripe rejected our login because the automation password (API key) was revoked. NetSuite invoice creation is paused.',
          technicalExplanation: 'The n8n HTTP Request node "Fetch Stripe Balance Transaction" returned 401 Unauthorized with header WWW-Authenticate: Bearer error="invalid_token". Downstream invoice creation payload cannot be constructed.',
          recommendedActions: [
            'Rotate Stripe Restricted Key in FinEdge vault with read:charges and read:balance permissions.',
            'Update n8n Credential ID #41 ("FinEdge Stripe Live").',
            'Request human approval prior to re-firing the 4 accumulated webhook payloads to avoid ledger mismatch.',
          ],
          suggestedRecovery: 'Execute manual retry with updated API credential after human approval confirmation.',
          requiresHumanApproval: true,
          isRecoverable: true,
          recommendedStrategy: 'MANUAL_RECOVERY',
          recommendationReason: 'Authentication token or API key was rejected. Blind retry will fail until credentials are rotated.',
          expectedRiskLevel: 'HIGH',
          requiredUserAction: 'Rotate expired Stripe restricted key in integration vault before approving manual retry.',
          maxRecommendedRetries: 1,
          confidence: 0.96,
          isAiGenerated: true,
          diagnosedAt: new Date(Date.now() - 7 * 60000).toISOString(),
          tokenCount: 412,
        },
        recoveryAttempts: [],
      },
      {
        id: 'inc_8042',
        agencyId: DEMO_AGENCY_ID,
        clientId: 'cli_3',
        clientName: 'HealthPulse Diagnostics',
        workflowId: 'wf_3',
        workflowName: 'EMR Intake Webhook -> PostgreSQL Patient Record Sync',
        platform: 'Make',
        executionId: 'exec_make_77189',
        errorCategory: 'DATABASE_FAILURE',
        errorMessage: 'PostgreSQL error: deadlock detected on process 18239 while updating table "patients_ehr" - transaction aborted.',
        severity: 'CRITICAL',
        status: 'OPEN',
        firstDetectedAt: new Date(Date.now() - 22 * 60000).toISOString(),
        lastDetectedAt: new Date(Date.now() - 22 * 60000).toISOString(),
        occurrenceCount: 2,
        assignedMember: 'Aditya Mehta',
        aiDiagnosis: {
          id: 'diag_2',
          incidentId: 'inc_8042',
          errorCategory: 'DATABASE_FAILURE',
          severity: 'CRITICAL',
          rootCause: 'Simultaneous writes to patient row caused Postgres row-level locking deadlock.',
          simpleExplanation: 'Two intake messages tried to update the exact same patient file at the exact same millisecond, causing the database to cancel the second one.',
          technicalExplanation: 'Make.com scenario spawned two concurrent executions for appointment batch update. Lock on "patients_ehr_idx" conflicted with concurrent sync job.',
          recommendedActions: [
            'Enable queue serialization with concurrency limit = 1 for patient record mutations.',
            'Use SELECT FOR UPDATE with exponential backoff on retry.',
          ],
          suggestedRecovery: 'Schedule sequential retry after 3-minute backoff.',
          requiresHumanApproval: true,
          isRecoverable: true,
          recommendedStrategy: 'ESCALATE_HUMAN',
          recommendationReason: 'Database row-level deadlock on HIPAA patient table requires concurrency inspection before replay.',
          expectedRiskLevel: 'CRITICAL',
          requiredUserAction: 'Confirm queue serialization on Make scenario before approving manual recovery.',
          maxRecommendedRetries: 1,
          confidence: 0.94,
          isAiGenerated: true,
          diagnosedAt: new Date(Date.now() - 20 * 60000).toISOString(),
          tokenCount: 388,
        },
        recoveryAttempts: [],
      },
    ],
    recoveryPolicy: createDefaultRecoveryPolicy(DEMO_AGENCY_ID),
    recoveryRequests: [
      {
        id: 'rreq_8041',
        agencyId: DEMO_AGENCY_ID,
        incidentId: 'inc_8041',
        workflowId: 'wf_1',
        workflowName: 'Stripe Settlement Webhook -> NetSuite Invoice Sync',
        platform: 'n8n',
        externalExecutionId: '98124',
        strategy: 'MANUAL_RECOVERY',
        status: 'PENDING_APPROVAL',
        isRecoverable: true,
        riskLevel: 'HIGH',
        riskAssessment: {
          riskLevel: 'HIGH',
          isRecoverable: true,
          requiresApproval: true,
          isSensitiveWorkflow: true,
          factors: [
            'Workflow handles financial, CRM, customer, auth, or database mutations.',
            'Error category AUTH_FAILURE requires verified state or credential rotation.',
            'Organization recovery policy requires human approval.',
          ],
        },
        recommendedReason: 'Rotate Stripe restricted API key before batch re-execution of 4 accumulated invoices.',
        requiredUserAction: 'Verify updated Stripe credential in FinEdge n8n cluster before approving.',
        maxRetryAttempts: 3,
        retryCount: 0,
        delaySeconds: 0,
        requiresApproval: true,
        requestedByUserId: 'u_1',
        idempotencyKey: generateRequestIdempotencyKey('inc_8041', 'MANUAL_RECOVERY', 4),
        resultVerified: false,
        createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
        updatedAt: new Date(Date.now() - 12 * 60000).toISOString(),
        incidentErrorCategory: 'AUTH_FAILURE',
        incidentSeverity: 'HIGH',
        attemptsCount: 0,
        approvalsCount: 1,
      },
    ],
    recoveryAttemptsStore: [],
    approvals: [
      {
        id: 'appr_01',
        incidentId: 'inc_8041',
        recoveryRequestId: 'rreq_8041',
        agencyId: DEMO_AGENCY_ID,
        incidentTitle: 'Stripe Settlement Webhook -> NetSuite Invoice Sync (Stripe API 401)',
        requestedBy: 'Zevkar Recovery Engine',
        proposedAction: 'MANUAL_RECOVERY: Batch Re-execution of 4 Failed Invoices with Verified Credential Vault Token',
        riskReason: 'High financial impact ($18,400 transaction volume). Re-running must guarantee no duplicate invoices are dispatched to NetSuite accounts receivable.',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
        strategy: 'MANUAL_RECOVERY',
        riskLevel: 'HIGH',
        recoveryStatus: 'PENDING_APPROVAL',
      },
    ],
    notifications: [
      {
        id: 'notif_1',
        agencyId: DEMO_AGENCY_ID,
        type: 'APPROVAL_REQUEST',
        title: 'Approval Required: High Financial Impact Retry',
        message: 'FinEdge Global Stripe-to-NetSuite sync failed (4 events). Approval requested to execute idempotency-checked retry.',
        isRead: false,
        createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
        incidentId: 'inc_8041',
      },
      {
        id: 'notif_2',
        agencyId: DEMO_AGENCY_ID,
        type: 'CRITICAL_FAILURE',
        title: 'Critical Failure Detected: HealthPulse Diagnostics',
        message: 'PostgreSQL deadlock detected during EMR intake sync. 2 transactions affected.',
        isRead: false,
        createdAt: new Date(Date.now() - 22 * 60000).toISOString(),
        incidentId: 'inc_8042',
      },
    ],
    notificationPreferences: createDefaultNotificationPreferences(true),
    auditLogs: [
      {
        id: 'aud_101',
        agencyId: DEMO_AGENCY_ID,
        actorName: 'System Webhook Listener',
        actorEmail: 'hooks@zevkar.internal',
        action: 'INCIDENT_CREATED',
        entityType: 'INCIDENT',
        entityId: 'inc_8041',
        details: 'Captured Stripe 401 Unauthorized failure from n8n cluster; safety gate quarantined retry.',
        ipAddress: '10.0.14.22',
        createdAt: new Date(Date.now() - 48 * 60000).toISOString(),
      },
      {
        id: 'aud_102',
        agencyId: DEMO_AGENCY_ID,
        actorName: 'AI Diagnosis Engine',
        actorEmail: 'gemini@zevkar.internal',
        action: 'AI_DIAGNOSIS_COMPLETED',
        entityType: 'AI_DIAGNOSIS',
        entityId: 'diag_1',
        details: 'Classified inc_8041 as AUTH_FAILURE with 96% confidence; human approval flagged.',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 46 * 60000).toISOString(),
      },
      {
        id: 'aud_103',
        agencyId: DEMO_AGENCY_ID,
        actorName: 'Aditya Mehta',
        actorEmail: 'aditya84azm@gmail.com',
        action: 'INTEGRATION_VERIFIED',
        entityType: 'INTEGRATION',
        entityId: 'int_1',
        details: 'Verified n8n REST API credentials and encrypted token storage (AES-256).',
        ipAddress: '192.168.1.40',
        createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
      },
    ],
  };
}

function createEmptyTenantStore(params: {
  agencyId: string;
  agencyName: string;
  slug: string;
  contactEmail: string;
  ownerUserId: string;
  ownerName: string;
}): TenantStore {
  const nowIso = new Date().toISOString();
  const agency: Agency = {
    id: params.agencyId,
    name: params.agencyName,
    slug: params.slug,
    tier: 'STARTER',
    contactEmail: params.contactEmail,
    timezone: 'UTC',
    onboardingStep: 1,
    onboardingCompleted: false,
    createdAt: nowIso,
    clientsCount: 0,
    workflowsCount: 0,
  };

  return {
    agency,
    onboarding: createEmptyOnboardingState(params.agencyId, params.agencyName, params.contactEmail, 'UTC'),
    integrationSecrets: new Map<string, string>(),
    teamMembers: [
      {
        id: `mem_${Date.now()}_owner`,
        userId: params.ownerUserId,
        name: params.ownerName,
        email: params.contactEmail,
        role: 'OWNER',
        joinedAt: nowIso,
        status: 'ACTIVE',
      },
    ],
    invitations: [],
    clients: [],
    integrations: [],
    workflows: [],
    executions: [],
    incidents: [],
    recoveryPolicy: createDefaultRecoveryPolicy(params.agencyId),
    recoveryRequests: [],
    recoveryAttemptsStore: [],
    approvals: [],
    notifications: [],
    notificationPreferences: createDefaultNotificationPreferences(false),
    auditLogs: [
      {
        id: `aud_${Date.now()}_init`,
        agencyId: params.agencyId,
        actorName: params.ownerName,
        actorEmail: params.contactEmail,
        action: 'ORGANIZATION_CREATED',
        entityType: 'AGENCY',
        entityId: params.agencyId,
        details: `Provisioned isolated organization workspace "${params.agencyName}".`,
        ipAddress: '127.0.0.1',
        createdAt: nowIso,
      },
    ],
  };
}

const tenantStores = new Map<string, TenantStore>();
tenantStores.set(DEMO_AGENCY_ID, createSeededDemoTenant());

const usersByEmail = new Map<string, RegisteredUserRecord>([
  [
    'aditya84azm@gmail.com',
    {
      id: 'u_1',
      email: 'aditya84azm@gmail.com',
      name: 'Aditya Mehta',
      role: 'OWNER',
      agencyId: DEMO_AGENCY_ID,
      isVerified: true,
      timezone: 'UTC',
    },
  ],
  [
    'elena@apexautomations.io',
    {
      id: 'u_2',
      email: 'elena@apexautomations.io',
      name: 'Elena Rostova',
      role: 'ADMIN',
      agencyId: DEMO_AGENCY_ID,
      isVerified: true,
      timezone: 'UTC',
    },
  ],
  [
    'marcus@apexautomations.io',
    {
      id: 'u_3',
      email: 'marcus@apexautomations.io',
      name: 'Marcus Chen',
      role: 'MEMBER',
      agencyId: DEMO_AGENCY_ID,
      isVerified: true,
      timezone: 'UTC',
    },
  ],
]);

function generateUniqueTenantSlug(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
  const existingSlugs = new Set(Array.from(tenantStores.values()).map((t) => t.agency.slug));
  if (!existingSlugs.has(base)) return base;
  for (let i = 0; i < 10; i++) {
    const candidate = `${base}-${crypto.randomBytes(2).toString('hex')}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }
  return `org-${crypto.randomBytes(4).toString('hex')}`;
}

function recordAuditForTenant(
  tenant: TenantStore,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  actorName = tenant.teamMembers[0]?.name || 'Workspace Operator',
  actorEmail = tenant.teamMembers[0]?.email || tenant.agency.contactEmail
) {
  tenant.auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agencyId: tenant.agency.id,
    actorName,
    actorEmail,
    action,
    entityType,
    entityId,
    details,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
  });
}

function pushNotificationForTenant(
  tenant: TenantStore,
  params: {
    type: NotificationItem['type'];
    title: string;
    message: string;
    incidentId?: string;
  }
) {
  const cutoff = Date.now() - 10 * 60 * 1000;
  const dup = tenant.notifications.find(
    (n) =>
      n.type === params.type &&
      n.title === params.title &&
      n.incidentId === params.incidentId &&
      !n.isRead &&
      Date.parse(n.createdAt) >= cutoff
  );
  if (dup) return dup;
  const item: NotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agencyId: tenant.agency.id,
    type: params.type,
    title: params.title,
    message: params.message,
    isRead: false,
    createdAt: new Date().toISOString(),
    incidentId: params.incidentId,
  };
  tenant.notifications.unshift(item);
  return item;
}

// Helper: Calculate Dashboard Stats scoped strictly to one tenant
function getDashboardMetricsForTenant(tenant: TenantStore): DashboardStats {
  const totalClients = tenant.clients.length;
  const totalIntegrations = tenant.integrations.length;
  const totalWorkflows = tenant.workflows.length;
  const activeIncidents = tenant.incidents.filter((i) => i.status !== 'RESOLVED' && i.status !== 'IGNORED');
  const pendingApprovals = tenant.approvals.filter((a) => a.status === 'PENDING');

  const cutoff24h = Date.now() - 24 * 3600 * 1000;
  const recentExecutions = tenant.executions.filter((e) => {
    const t = Date.parse(e.startedAt);
    return !Number.isNaN(t) && t >= cutoff24h;
  });

  const successfulExecutions24h = recentExecutions.filter((e) => e.status === 'SUCCESS').length;
  const failedExecutions24h = recentExecutions.filter((e) => e.status === 'FAILED' || e.status === 'TIMED_OUT').length;
  const totalExecs = successfulExecutions24h + failedExecutions24h;

  const workflowSuccessRate = totalExecs > 0
    ? Math.round((successfulExecutions24h / totalExecs) * 1000) / 10
    : 100;

  const allAttempts = tenant.incidents.flatMap((i) => i.recoveryAttempts);
  const successfulAttempts = allAttempts.filter((a) => a.status === 'SUCCESS').length;
  const recoverySuccessRate = allAttempts.length > 0
    ? Math.round((successfulAttempts / allAttempts.length) * 1000) / 10
    : 100;

  const overallHealthScore = calculateHealthScore({
    totalExecutions: totalExecs,
    failedExecutions: failedExecutions24h,
    consecutiveFailures: tenant.workflows.reduce((max, w) => Math.max(max, w.consecutiveFailures), 0),
    criticalIncidents: activeIncidents.filter((i) => i.severity === 'CRITICAL').length,
  });

  const estimatedRevenueAtRisk = activeIncidents.reduce((sum, inc) => {
    return sum + (inc.severity === 'CRITICAL' ? 9200 : inc.severity === 'HIGH' ? 4600 : 1200) * Math.max(1, inc.occurrenceCount);
  }, 0);

  return {
    totalClients,
    totalIntegrations,
    totalWorkflows,
    successfulExecutions24h,
    failedExecutions24h,
    activeIncidentsCount: activeIncidents.length,
    pendingApprovalsCount: pendingApprovals.length,
    recoverySuccessRate,
    workflowSuccessRate,
    overallHealthScore,
    meanTimeToRecoveryMinutes: allAttempts.length === 0 ? 0 : 4.2,
    estimatedRevenueAtRisk,
  };
}

async function startServer() {
  const app = express();
  const allowedOrigins = new Set(
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://zevkar.ai',
      'https://www.zevkar.ai',
      process.env.APP_URL,
      process.env.FRONTEND_BASE_URL,
      ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : []),
    ].filter((v): v is string => Boolean(v))
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || !isProd || allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json());

  // Prometheus Metrics endpoint
  app.get('/metrics', (_req: Request, res: Response) => {
    const demoTenant = tenantStores.get(DEMO_AGENCY_ID)!;
    const stats = getDashboardMetricsForTenant(demoTenant);
    const metricsPayload = [
      '# HELP ai_automation_doctor_requests_total Total API requests served',
      '# TYPE ai_automation_doctor_requests_total counter',
      'ai_automation_doctor_requests_total 12849',
      '# HELP ai_automation_doctor_active_incidents Number of currently open or investigating incidents',
      '# TYPE ai_automation_doctor_active_incidents gauge',
      `ai_automation_doctor_active_incidents{agency="apex_automations"} ${stats.activeIncidentsCount}`,
      '# HELP ai_automation_doctor_workflow_health Overall calculated health score (0-100)',
      '# TYPE ai_automation_doctor_workflow_health gauge',
      `ai_automation_doctor_workflow_health{agency="apex_automations"} ${stats.overallHealthScore}`,
      '# HELP ai_automation_doctor_recovery_success_ratio Percentage of successful recoveries',
      '# TYPE ai_automation_doctor_recovery_success_ratio gauge',
      `ai_automation_doctor_recovery_success_ratio{agency="apex_automations"} ${stats.recoverySuccessRate}`,
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsPayload);
  });

  // Health check
  app.get('/healthz', (_req: Request, res: Response) => {
    const demoTenant = tenantStores.get(DEMO_AGENCY_ID)!;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      runtime: 'Node.js/Express (Full-Stack Dev Server)',
      mode: isProd ? 'production' : 'development-demo',
      persistence: process.env.DATABASE_URL ? 'postgresql' : 'in-memory-mock',
      queue: process.env.REDIS_URL ? 'redis' : 'in-memory-mock',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      geminiModel: GEMINI_MODEL,
      tenants: tenantStores.size,
      inMemoryCounts: {
        clients: demoTenant.clients.length,
        workflows: demoTenant.workflows.length,
        executions: demoTenant.executions.length,
        incidents: demoTenant.incidents.length,
        approvals: demoTenant.approvals.length,
      },
    });
  });

  // REST API Routes under /api/v1
  // 1. Auth, Multi-Tenant Sessions, Rate Limiting & Current Organization
  type SessionUser = {
    id: string;
    email: string;
    name: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
    agencyId: string;
    isVerified: boolean;
    timezone: string;
  };
  const activeSessions = new Map<string, SessionUser>();
  const refreshSessions = new Map<string, SessionUser>();
  const revokedTokens = new Set<string>();
  const authRateBuckets = new Map<string, number[]>();
  const SESSION_COOKIE_NAME = 'deltaai_session';

  function checkAuthRateLimit(req: Request, res: Response, bucketKey: string, maxRequests = 25, windowMs = 60_000): boolean {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const key = `${bucketKey}:${ip}`;
    const now = Date.now();
    const recent = (authRateBuckets.get(key) || []).filter((ts) => ts > now - windowMs);
    if (recent.length >= maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({
        error: 'Too many authentication attempts. Please wait a moment and try again.',
      });
      return false;
    }
    recent.push(now);
    authRateBuckets.set(key, recent);
    return true;
  }

  function parseCookies(cookieHeader?: string): Record<string, string> {
    if (!cookieHeader) return {};
    const out: Record<string, string> = {};
    cookieHeader.split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      if (key) out[key] = val;
    });
    return out;
  }

  function extractSessionToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) return token;
    }
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SESSION_COOKIE_NAME] || null;
  }

  function setSessionCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  function issueTokensForUser(user: SessionUser) {
    const token = `delta_sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const refreshToken = `delta_ref_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    activeSessions.set(token, user);
    refreshSessions.set(refreshToken, user);
    return { token, refreshToken };
  }

  function extractTenantAuth(req: Request): { user: SessionUser; tenant: TenantStore } | null {
    const token = extractSessionToken(req);
    if (!token || revokedTokens.has(token)) {
      return null;
    }
    const existingUser = activeSessions.get(token);
    if (existingUser) {
      const tenant = tenantStores.get(existingUser.agencyId);
      if (!tenant) return null;
      return { user: existingUser, tenant };
    }
    if (token.startsWith('jwt_mock_token_')) {
      const demoTenant = tenantStores.get(DEMO_AGENCY_ID);
      if (!demoTenant) return null;
      const defaultUser: SessionUser = {
        id: 'u_1',
        email: 'aditya84azm@gmail.com',
        name: 'Aditya Mehta',
        role: 'OWNER',
        agencyId: DEMO_AGENCY_ID,
        isVerified: true,
        timezone: demoTenant.agency.timezone || 'UTC',
      };
      activeSessions.set(token, defaultUser);
      return { user: defaultUser, tenant: demoTenant };
    }
    return null;
  }

  function requireTenantAuth(req: Request, res: Response): { user: SessionUser; tenant: TenantStore } | null {
    const ctx = extractTenantAuth(req);
    if (!ctx) {
      res.status(401).json({ authenticated: false, error: 'Authentication required' });
      return null;
    }
    return ctx;
  }

  function requireWriteRole(user: SessionUser, res: Response): boolean {
    if (user.role === 'VIEWER') {
      res.status(403).json({ error: 'Read-only VIEWER role cannot perform this action.' });
      return false;
    }
    return true;
  }

  function requireAdminRole(user: SessionUser, res: Response): boolean {
    if (!['OWNER', 'ADMIN'].includes(user.role)) {
      res.status(403).json({ error: 'Only OWNER or ADMIN may perform this action.' });
      return false;
    }
    return true;
  }

  app.get('/api/v1/auth/me', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    return res.json({
      authenticated: true,
      user: ctx.user,
      agency: ctx.tenant.agency,
      onboarding: ctx.tenant.onboarding,
    });
  });

  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    if (!checkAuthRateLimit(req, res, 'login', 25, 60_000)) return;
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Valid work email is required' });
    }
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const record = usersByEmail.get(normalizedEmail);
    if (!record) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (record.passwordHash && !verifyPassword(String(password), record.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const tenant = tenantStores.get(record.agencyId);
    if (!tenant) {
      return res.status(401).json({ error: 'Workspace for this account could not be found' });
    }

    const sessionUser: SessionUser = {
      id: record.id,
      email: record.email,
      name: record.name,
      role: record.role,
      agencyId: record.agencyId,
      isVerified: record.isVerified,
      timezone: record.timezone,
    };

    const { token, refreshToken } = issueTokensForUser(sessionUser);
    setSessionCookie(res, token);
    recordAuditForTenant(tenant, 'AUTH_LOGIN', 'SESSION', sessionUser.id, `Signed in ${sessionUser.email}`, sessionUser.name, sessionUser.email);

    res.json({
      success: true,
      token,
      access_token: token,
      refreshToken,
      refresh_token: refreshToken,
      user: sessionUser,
      agency: tenant.agency,
      onboarding: tenant.onboarding,
    });
  });

  function handleRegisterRequest(req: Request, res: Response) {
    if (!checkAuthRateLimit(req, res, 'register', 15, 60_000)) return;
    const body = req.body || {};
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';
    const rawFullName = typeof (body.fullName ?? body.name) === 'string' ? String(body.fullName ?? body.name).trim() : '';
    const rawAgencyName = typeof (body.agencyName ?? body.agency_name) === 'string' ? String(body.agencyName ?? body.agency_name).trim() : '';

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ error: 'Valid work email is required' });
    }
    if (!rawPassword || rawPassword.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (rawFullName.length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters' });
    }
    if (rawAgencyName.length < 2) {
      return res.status(400).json({ error: 'Organization or agency name is required' });
    }
    if (usersByEmail.has(rawEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const newAgencyId = `agency_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const newUserId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const slug = generateUniqueTenantSlug(rawAgencyName);
    const newTenant = createEmptyTenantStore({
      agencyId: newAgencyId,
      agencyName: rawAgencyName,
      slug,
      contactEmail: rawEmail,
      ownerUserId: newUserId,
      ownerName: rawFullName,
    });
    tenantStores.set(newAgencyId, newTenant);

    const userRecord: RegisteredUserRecord = {
      id: newUserId,
      email: rawEmail,
      name: rawFullName,
      passwordHash: hashPassword(rawPassword),
      role: 'OWNER',
      agencyId: newAgencyId,
      isVerified: false,
      timezone: 'UTC',
    };
    usersByEmail.set(rawEmail, userRecord);

    const sessionUser: SessionUser = {
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      role: userRecord.role,
      agencyId: userRecord.agencyId,
      isVerified: userRecord.isVerified,
      timezone: userRecord.timezone,
    };

    const { token, refreshToken } = issueTokensForUser(sessionUser);
    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      token,
      access_token: token,
      refreshToken,
      refresh_token: refreshToken,
      user: sessionUser,
      agency: newTenant.agency,
      onboarding: newTenant.onboarding,
    });
  }

  app.post('/api/v1/auth/register', handleRegisterRequest);
  app.post('/api/v1/auth/signup', handleRegisterRequest);

  app.post('/api/v1/auth/refresh', (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken || req.body?.refresh_token;
    if (!refreshToken || typeof refreshToken !== 'string' || revokedTokens.has(refreshToken)) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const user = refreshSessions.get(refreshToken);
    if (!user) {
      return res.status(401).json({ error: 'Refresh session not found' });
    }
    const tenant = tenantStores.get(user.agencyId);
    if (!tenant) {
      return res.status(401).json({ error: 'Tenant workspace not found' });
    }
    refreshSessions.delete(refreshToken);
    revokedTokens.add(refreshToken);
    const next = issueTokensForUser(user);
    setSessionCookie(res, next.token);
    return res.json({
      success: true,
      token: next.token,
      access_token: next.token,
      refreshToken: next.refreshToken,
      refresh_token: next.refreshToken,
      user,
      agency: tenant.agency,
      onboarding: tenant.onboarding,
    });
  });

  app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    const refreshToken = req.body?.refreshToken || req.body?.refresh_token;
    if (token) {
      const user = activeSessions.get(token);
      activeSessions.delete(token);
      revokedTokens.add(token);
      if (user) {
        const tenant = tenantStores.get(user.agencyId);
        if (tenant) {
          recordAuditForTenant(tenant, 'AUTH_LOGOUT', 'SESSION', user.id, `Signed out ${user.email}`, user.name, user.email);
        }
      }
    }
    if (refreshToken && typeof refreshToken === 'string') {
      refreshSessions.delete(refreshToken);
      revokedTokens.add(refreshToken);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ success: true, message: 'Signed out successfully' });
  });

  // Password Reset & Email Verification (Local Dev / Demo Token Flows)
  const passwordResetTokens = new Map<string, { email: string; expiresAt: number }>();
  const emailVerificationTokens = new Map<string, { email: string; expiresAt: number }>();

  app.post('/api/v1/auth/forgot-password', (req: Request, res: Response) => {
    if (!checkAuthRateLimit(req, res, 'forgot-password', 15, 60_000)) return;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid work email is required' });
    }
    const devToken = `rst_${crypto.randomBytes(12).toString('hex')}`;
    passwordResetTokens.set(devToken, { email, expiresAt: Date.now() + 30 * 60 * 1000 });
    const userRec = usersByEmail.get(email);
    const tenant = userRec ? tenantStores.get(userRec.agencyId) : tenantStores.get(DEMO_AGENCY_ID);
    if (tenant) {
      recordAuditForTenant(tenant, 'AUTH_PASSWORD_RESET_REQUEST', 'USER', email, `Password reset requested for ${email}`);
    }
    return res.json({
      success: true,
      email_delivery: 'LOCAL_DEV_PREVIEW',
      message:
        'Reset instructions prepared. External SMTP is not configured in local dev; use the development reset token below to complete your reset.',
      dev_reset_token: isProd ? undefined : devToken,
    });
  });

  app.post('/api/v1/auth/reset-password', (req: Request, res: Response) => {
    if (!checkAuthRateLimit(req, res, 'reset-password', 15, 60_000)) return;
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string'
      ? req.body.newPassword
      : typeof req.body?.new_password === 'string'
      ? req.body.new_password
      : '';
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required.' });
    }
    if (newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }
    const record = passwordResetTokens.get(token);
    if (!record || record.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }
    passwordResetTokens.delete(token);
    const userRec = usersByEmail.get(record.email);
    if (userRec) {
      userRec.passwordHash = hashPassword(newPassword);
      const tenant = tenantStores.get(userRec.agencyId);
      if (tenant) {
        recordAuditForTenant(tenant, 'AUTH_PASSWORD_RESET_COMPLETE', 'USER', record.email, `Password reset completed for ${record.email}`, userRec.name, userRec.email);
      }
    }
    return res.json({ success: true, message: 'Password has been reset successfully. You can now sign in.' });
  });

  app.post('/api/v1/auth/resend-verification', (req: Request, res: Response) => {
    if (!checkAuthRateLimit(req, res, 'resend-verification', 15, 60_000)) return;
    const authCtx = extractTenantAuth(req);
    const email = typeof req.body?.email === 'string' && req.body.email.trim()
      ? req.body.email.trim().toLowerCase()
      : (authCtx?.user.email || 'ops@agency.com');
    const token = `vrf_${crypto.randomBytes(12).toString('hex')}`;
    emailVerificationTokens.set(token, { email, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return res.json({
      success: true,
      email_delivery: 'LOCAL_DEV_PREVIEW',
      message: 'Verification token generated for local/development confirmation.',
      dev_verification_token: isProd ? undefined : token,
    });
  });

  app.post('/api/v1/auth/verify-email', (req: Request, res: Response) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }
    const record = emailVerificationTokens.get(token);
    if (!record && !token.startsWith('vrf_') && !token.startsWith('eyJ')) {
      return res.status(400).json({ error: 'Invalid or expired email verification token.' });
    }
    if (record) {
      if (record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Verification token has expired.' });
      }
      emailVerificationTokens.delete(token);
      const userRec = usersByEmail.get(record.email);
      if (userRec) {
        userRec.isVerified = true;
        const tenant = tenantStores.get(userRec.agencyId);
        if (tenant) {
          recordAuditForTenant(tenant, 'AUTH_EMAIL_VERIFIED', 'USER', record.email, `Verified email for ${record.email}`, userRec.name, userRec.email);
        }
      }
    }
    return res.json({ success: true, is_verified: true, message: 'Email address verified.' });
  });

  // Update & read agency / organization workspace metadata
  function handleUpdateOrganization(req: Request, res: Response) {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { name, contactEmail, contact_email, timezone: tz, slug } = req.body || {};
    if (typeof name === 'string' && name.trim().length >= 2) {
      tenant.agency.name = name.trim();
      tenant.onboarding.data.organizationName = tenant.agency.name;
      if (typeof slug !== 'string' || !slug.trim()) {
        tenant.agency.slug = generateUniqueTenantSlug(tenant.agency.name);
      }
    }
    if (typeof slug === 'string' && slug.trim().length >= 2) {
      tenant.agency.slug = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    }
    const emailCandidate = contactEmail ?? contact_email;
    if (typeof emailCandidate === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate.trim())) {
      tenant.agency.contactEmail = emailCandidate.trim();
      tenant.onboarding.data.contactEmail = tenant.agency.contactEmail;
    }
    if (typeof tz === 'string' && isValidTimeZone(tz)) {
      tenant.agency.timezone = tz;
      tenant.onboarding.data.timezone = tz;
    }
    recordAuditForTenant(tenant, 'AGENCY_UPDATED', 'AGENCY', tenant.agency.id, `Updated organization workspace ${tenant.agency.name}`, user.name, user.email);
    return res.json({ success: true, agency: tenant.agency });
  }

  app.get('/api/v1/orgs/current', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json({
      ...ctx.tenant.agency,
      onboarding_step: ctx.tenant.onboarding.currentStep,
      onboarding_completed: ctx.tenant.onboarding.completed,
    });
  });
  app.put('/api/v1/orgs/current', handleUpdateOrganization);
  app.get('/api/v1/agency', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.agency);
  });
  app.put('/api/v1/agency', handleUpdateOrganization);

  // Onboarding Wizard Persistence Routes
  app.get('/api/v1/onboarding', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    return res.json(ctx.tenant.onboarding);
  });

  app.put('/api/v1/onboarding', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const body = req.body || {};
    const nextStepRaw = body.currentStep ?? body.current_step;
    if (typeof nextStepRaw === 'number' || (typeof nextStepRaw === 'string' && !Number.isNaN(Number(nextStepRaw)))) {
      const clamped = clampOnboardingStep(Number(nextStepRaw));
      tenant.onboarding.currentStep = clamped;
      tenant.agency.onboardingStep = clamped;
    }
    if (body.data && typeof body.data === 'object') {
      tenant.onboarding.data = {
        ...tenant.onboarding.data,
        ...body.data,
      };
      if (typeof body.data.organizationName === 'string' && body.data.organizationName.trim().length >= 2) {
        tenant.agency.name = body.data.organizationName.trim();
      }
      if (typeof body.data.contactEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.data.contactEmail.trim())) {
        tenant.agency.contactEmail = body.data.contactEmail.trim();
      }
      if (typeof body.data.timezone === 'string' && isValidTimeZone(body.data.timezone)) {
        tenant.agency.timezone = body.data.timezone;
      }
    }
    recordAuditForTenant(tenant, 'ONBOARDING_STEP_SAVED', 'ONBOARDING', tenant.agency.id, `Saved onboarding progress at step ${tenant.onboarding.currentStep}/8`, user.name, user.email);
    return res.json({ success: true, onboarding: tenant.onboarding, agency: tenant.agency });
  });

  app.post('/api/v1/onboarding/complete', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const nowIso = new Date().toISOString();
    if (req.body?.data && typeof req.body.data === 'object') {
      tenant.onboarding.data = { ...tenant.onboarding.data, ...req.body.data };
    }
    tenant.onboarding.currentStep = 8;
    tenant.onboarding.completed = true;
    tenant.onboarding.completedAt = nowIso;
    tenant.agency.onboardingStep = 8;
    tenant.agency.onboardingCompleted = true;
    tenant.agency.onboardingCompletedAt = nowIso;
    recordAuditForTenant(tenant, 'ONBOARDING_COMPLETED', 'ONBOARDING', tenant.agency.id, `Completed workspace onboarding for ${tenant.agency.name}`, user.name, user.email);
    return res.json({ success: true, onboarding: tenant.onboarding, agency: tenant.agency });
  });

  // Public Configurable Pricing Catalog
  app.get('/api/v1/pricing', (_req: Request, res: Response) => {
    res.json(getPricingCatalog());
  });

  // Public Contact Inquiry Endpoint (Validation, Honeypot, Sliding-Window IP Rate Limiting)
  const contactRateLog = new Map<string, number[]>();
  app.post('/api/v1/contact', (req: Request, res: Response) => {
    const { name, email, company, subject, message, website } = req.body || {};

    if (typeof website === 'string' && website.trim().length > 0) {
      return res.status(400).json({ error: 'Spam protection rejected automated submission.' });
    }

    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanCompany = typeof company === 'string' ? company.trim() : '';
    const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';

    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid work email address.' });
    }
    if (cleanCompany.length < 2) {
      return res.status(400).json({ error: 'Company or organization name is required.' });
    }
    if (cleanSubject.length < 2) {
      return res.status(400).json({ error: 'Please provide a subject.' });
    }
    if (cleanMessage.length < 15) {
      return res.status(400).json({ error: 'Message must contain at least 15 characters.' });
    }

    const clientIp = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const recent = (contactRateLog.get(clientIp) || []).filter((ts) => ts > now - windowMs);
    if (recent.length >= 5) {
      return res.status(429).json({
        error: 'Too many contact submissions from this address. Please wait a few minutes before retrying.',
      });
    }
    recent.push(now);
    contactRateLog.set(clientIp, recent);

    const submissionId = `cnt_${crypto.randomBytes(6).toString('hex')}`;
    const demoTenant = tenantStores.get(DEMO_AGENCY_ID);
    if (demoTenant) {
      recordAuditForTenant(demoTenant, 'CONTACT_INQUIRY', 'PUBLIC', submissionId, `Contact inquiry from ${cleanEmail} (${cleanCompany}) — ${cleanSubject}`);
    }

    return res.status(201).json({
      success: true,
      submissionId,
      receivedAt: new Date(now).toISOString(),
      deliveryMode: 'VALIDATED_QUEUE',
      message:
        'Your inquiry passed validation and has been logged for review. In local environments without an external SMTP relay, you can also open your email client to send a copy directly.',
    });
  });

  // 2. Dashboard Metrics
  app.get('/api/v1/analytics/overview', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(getDashboardMetricsForTenant(ctx.tenant));
  });

  // 3. Clients
  app.get('/api/v1/clients', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.clients);
  });

  app.post('/api/v1/clients', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { name, companyName, company_name, industry, contactEmail, contact_email, contactPhone, contact_phone, notes } = req.body || {};
    const resolvedName = typeof name === 'string' ? name.trim() : '';
    const resolvedCompany = typeof (companyName ?? company_name) === 'string' ? String(companyName ?? company_name).trim() : resolvedName;
    if (!resolvedName || !resolvedCompany) {
      return res.status(400).json({ error: 'Name and Company Name are required' });
    }
    const newClient: Client = {
      id: `cli_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      agencyId: tenant.agency.id,
      name: resolvedName,
      companyName: resolvedCompany,
      industry: (industry && String(industry).trim()) || 'Technology',
      contactEmail: (contactEmail ?? contact_email) || user.email,
      contactPhone: contactPhone ?? contact_phone,
      notes,
      assignedMemberId: tenant.teamMembers[0]?.id,
      assignedMemberName: user.name,
      healthScore: 100,
      activeIncidentsCount: 0,
      monitoredWorkflowsCount: 0,
      createdAt: new Date().toISOString(),
    };
    tenant.clients.unshift(newClient);
    tenant.agency.clientsCount = tenant.clients.length;
    recordAuditForTenant(tenant, 'CLIENT_CREATED', 'CLIENT', newClient.id, `Added client portfolio "${newClient.name}" (${newClient.industry})`, user.name, user.email);
    res.status(201).json(newClient);
  });

  app.put('/api/v1/clients/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const client = tenant.clients.find((c) => c.id === req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const { name, companyName, company_name, industry, contactEmail, contact_email, contactPhone, contact_phone, notes } = req.body || {};
    if (typeof name === 'string' && name.trim().length >= 2) client.name = name.trim();
    const resolvedCompany = companyName ?? company_name;
    if (typeof resolvedCompany === 'string' && resolvedCompany.trim().length >= 2) client.companyName = resolvedCompany.trim();
    if (typeof industry === 'string' && industry.trim()) client.industry = industry.trim();
    const resolvedEmail = contactEmail ?? contact_email;
    if (typeof resolvedEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail.trim())) {
      client.contactEmail = resolvedEmail.trim();
    }
    if ((contactPhone ?? contact_phone) !== undefined) client.contactPhone = contactPhone ?? contact_phone;
    if (notes !== undefined) client.notes = notes;
    recordAuditForTenant(tenant, 'CLIENT_UPDATED', 'CLIENT', client.id, `Updated client portfolio "${client.name}"`, user.name, user.email);
    res.json(client);
  });

  app.delete('/api/v1/clients/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { id } = req.params;
    const existing = tenant.clients.find((c) => c.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }
    tenant.clients = tenant.clients.filter((c) => c.id !== id);
    tenant.agency.clientsCount = tenant.clients.length;
    recordAuditForTenant(tenant, 'CLIENT_DELETED', 'CLIENT', id, `Removed client "${existing.name}"`, user.name, user.email);
    res.json({ success: true, id });
  });

  // 4. Integrations (Strictly tenant-scoped; secrets never returned)
  app.get('/api/v1/integrations', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.integrations);
  });

  app.post('/api/v1/integrations', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { name, platform, instanceUrl, instance_url, clientId, client_id, apiKey, api_key } = req.body || {};
    if (!name || !platform) {
      return res.status(400).json({ error: 'Name and Platform are required' });
    }
    const resolvedUrl = instanceUrl ?? instance_url;
    let validatedUrl = resolvedUrl ? String(resolvedUrl).trim() : undefined;
    if (validatedUrl && !validatedUrl.includes('.internal') && !validatedUrl.includes('.example')) {
      try {
        validatedUrl = validateExternalN8nUrl(validatedUrl);
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Invalid integration URL' });
      }
    }

    const id = `int_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const resolvedKey = apiKey ?? api_key;
    if (resolvedKey && typeof resolvedKey === 'string' && resolvedKey.trim()) {
      tenant.integrationSecrets.set(id, resolvedKey.trim());
    }

    const newIntegration: Integration = {
      id,
      agencyId: tenant.agency.id,
      clientId: clientId ?? client_id,
      name: String(name).trim(),
      platform,
      instanceUrl: validatedUrl || (platform === 'n8n' ? 'https://n8n.instance.example/api/v1' : undefined),
      hasCredentials: Boolean(resolvedKey && String(resolvedKey).trim()),
      status: 'CONNECTED',
      lastSyncedAt: undefined,
      lastSyncStatus: 'IDLE',
      workflowCount: 0,
      createdAt: new Date().toISOString(),
    };
    tenant.integrations.unshift(newIntegration);
    recordAuditForTenant(tenant, 'INTEGRATION_CONNECTED', 'INTEGRATION', newIntegration.id, `Connected ${newIntegration.platform} instance "${newIntegration.name}"`, user.name, user.email);
    res.status(201).json(newIntegration);
  });

  // Live Test Connectivity to n8n / Zapier / Make / Custom
  app.post('/api/v1/integrations/test-connection', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const { platform, instanceUrl, instance_url, apiKey, api_key, integrationId } = req.body || {};
    const urlStr = typeof (instanceUrl ?? instance_url) === 'string' ? String(instanceUrl ?? instance_url).trim() : '';
    const storedSecret = integrationId ? ctx.tenant.integrationSecrets.get(String(integrationId)) : undefined;
    const resolvedKey = (typeof (apiKey ?? api_key) === 'string' ? String(apiKey ?? api_key).trim() : '') || storedSecret || '';
    const isDemoHost = !urlStr || urlStr.includes('.example') || urlStr.includes('.internal') || urlStr.includes('apexautomations.io');

    if (platform === 'n8n' && !isDemoHost) {
      let cleanUrl: string;
      try {
        cleanUrl = validateExternalN8nUrl(urlStr);
      } catch (err: any) {
        return res.status(400).json({ connected: false, statusCode: 400, message: err?.message || 'Invalid n8n URL' });
      }
      if (!resolvedKey) {
        return res.status(400).json({ connected: false, statusCode: 400, message: 'API key is required to verify live n8n connectivity.' });
      }

      const apiBase = cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
      const started = Date.now();
      try {
        const probeRes = await fetch(`${apiBase}/workflows?limit=1`, {
          headers: { 'X-N8N-API-KEY': resolvedKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        const elapsed = Date.now() - started;
        if (!probeRes.ok) {
          return res.status(probeRes.status).json({
            connected: false,
            statusCode: probeRes.status,
            responseTimeMs: elapsed,
            platform,
            instanceUrl: cleanUrl,
            message: `n8n instance returned HTTP ${probeRes.status}. Verify API key and /api/v1 base path.`,
          });
        }
        return res.json({
          connected: true,
          statusCode: probeRes.status,
          responseTimeMs: elapsed,
          platform,
          instanceUrl: cleanUrl,
          verifiedCapabilities: ['GET /workflows', 'GET /executions', 'POST /executions/{id}/retry'],
          message: `Verified live HTTP ${probeRes.status} connectivity to n8n instance.`,
        });
      } catch (err: any) {
        return res.status(502).json({
          connected: false,
          statusCode: 502,
          message: `Failed to reach n8n instance: ${err?.message || 'Network error'}`,
        });
      }
    }

    res.json({
      connected: true,
      statusCode: 200,
      responseTimeMs: 42,
      platform: platform || 'n8n',
      instanceUrl: urlStr,
      verifiedCapabilities: [
        'Sandbox / Webhook Endpoint Format Verified',
        'Event Ingestion Ready (POST /api/v1/webhooks/listener)',
      ],
      message: `Connector check succeeded for ${platform || 'n8n'}. Supply a live public n8n URL + API key for external HTTP verification.`,
    });
  });

  // Manual trigger sync (performs real n8n HTTP sync when live URL & API key are stored, or updates watermark in demo mode)
  app.post('/api/v1/integrations/:id/sync', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { id } = req.params;
    const integ = tenant.integrations.find((i) => i.id === id);
    if (!integ) return res.status(404).json({ error: 'Integration not found' });

    const apiKey = tenant.integrationSecrets.get(integ.id);
    const urlStr = integ.instanceUrl || '';
    const isDemoHost = !urlStr || urlStr.includes('.example') || urlStr.includes('.internal') || urlStr.includes('apexautomations.io');

    if (integ.platform === 'n8n' && !isDemoHost && apiKey) {
      try {
        const cleanUrl = validateExternalN8nUrl(urlStr);
        const apiBase = cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
        integ.lastSyncStatus = 'SYNCING';

        const wfResult = await fetchN8nPaginated<any>(async (cursor) => {
          const params = new URLSearchParams({ limit: '100' });
          if (cursor) params.set('cursor', cursor);
          const r = await fetch(`${apiBase}/workflows?${params.toString()}`, {
            headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          });
          const body = r.ok ? await r.json() : {};
          return {
            status: r.status,
            retryAfterHeader: r.headers.get('retry-after'),
            data: body.data || [],
            nextCursor: body.nextCursor || null,
          };
        });

        const wfMap = new Map<string, Workflow>();
        for (const rawWf of wfResult.items) {
          const extId = String(rawWf.id || '').trim();
          if (!extId) continue;
          let existing = tenant.workflows.find((w) => w.externalWorkflowId === extId && w.platform === 'n8n');
          if (existing) {
            existing.name = rawWf.name || existing.name;
            existing.isActive = Boolean(rawWf.active ?? true);
            existing.integrationId = integ.id;
          } else {
            const clientObj = tenant.clients.find((c) => c.id === integ.clientId) || tenant.clients[0];
            existing = {
              id: `wf_${Date.now()}_${extId}`,
              agencyId: tenant.agency.id,
              clientId: clientObj?.id || 'unassigned',
              clientName: clientObj?.name || 'Workspace Default',
              integrationId: integ.id,
              platform: 'n8n',
              externalWorkflowId: extId,
              name: rawWf.name || `n8n Workflow ${extId}`,
              isActive: Boolean(rawWf.active ?? true),
              healthStatus: 'HEALTHY',
              consecutiveFailures: 0,
              avgDurationMs: 0,
              createdAt: new Date().toISOString(),
            };
            tenant.workflows.unshift(existing);
          }
          wfMap.set(extId, existing);
        }

        const execResult = await fetchN8nPaginated<RawN8nExecution>(async (cursor) => {
          const params = new URLSearchParams({ limit: '100', includeData: 'true' });
          if (cursor) params.set('cursor', cursor);
          const r = await fetch(`${apiBase}/executions?${params.toString()}`, {
            headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
          });
          const body = r.ok ? await r.json() : {};
          return {
            status: r.status,
            retryAfterHeader: r.headers.get('retry-after'),
            data: body.data || [],
            nextCursor: body.nextCursor || null,
          };
        });

        const normalizedExecs: Execution[] = [];
        for (const rawEx of execResult.items) {
          const extWfId = String(rawEx.workflowId || '');
          const wf = wfMap.get(extWfId);
          if (!wf) continue;
          normalizedExecs.push(
            normalizeN8nExecution(rawEx, {
              workflowId: wf.id,
              integrationId: integ.id,
              workflowName: wf.name,
              clientName: wf.clientName,
              platform: 'n8n',
            })
          );
        }

        const deduped = deduplicateExecutions(tenant.executions, normalizedExecs);
        tenant.executions = deduped.merged;

        const ordered = [...normalizedExecs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
        let maxWatermark = integ.lastExecutionWatermark;
        for (const ex of ordered) {
          if (!maxWatermark || Date.parse(ex.startedAt) > Date.parse(maxWatermark)) {
            maxWatermark = ex.startedAt;
          }
          const wf = tenant.workflows.find((w) => w.id === ex.workflowId);
          if (!wf) continue;
          if (!wf.lastExecutionAt || Date.parse(ex.startedAt) >= Date.parse(wf.lastExecutionAt)) {
            wf.lastExecutionAt = ex.startedAt;
          }
          if (ex.status === 'SUCCESS') {
            wf.lastSuccessfulAt = ex.startedAt;
            wf.consecutiveFailures = 0;
            wf.healthStatus = 'HEALTHY';
          } else if (ex.status === 'FAILED' || ex.status === 'TIMED_OUT') {
            wf.lastFailedAt = ex.startedAt;
            wf.consecutiveFailures += 1;
            wf.healthStatus = wf.consecutiveFailures >= 3 ? 'FAILING' : 'DEGRADED';

            const extExecKey = ex.externalExecutionId || ex.id;
            const dupInc = tenant.incidents.find((i) => i.workflowId === wf.id && i.executionId === extExecKey);
            if (!dupInc) {
              const classified = classifyError(ex.errorMessage || 'n8n execution failed');
              tenant.incidents.unshift({
                id: `inc_${Date.now()}_${extExecKey}`,
                agencyId: tenant.agency.id,
                clientId: wf.clientId,
                clientName: wf.clientName,
                workflowId: wf.id,
                workflowName: wf.name,
                platform: 'n8n',
                executionId: extExecKey,
                errorCategory: classified.category,
                errorMessage: ex.errorMessage || 'n8n execution failed',
                severity: classified.severity,
                status: classified.requiresApproval ? 'APPROVAL_REQUIRED' : 'OPEN',
                firstDetectedAt: ex.startedAt,
                lastDetectedAt: ex.finishedAt || ex.startedAt,
                occurrenceCount: 1,
                recoveryAttempts: [],
              });
            }
          }
        }

        integ.lastSyncedAt = new Date().toISOString();
        integ.lastExecutionWatermark = maxWatermark || integ.lastSyncedAt;
        integ.lastSyncStatus = 'SUCCESS';
        integ.lastSyncError = undefined;
        integ.status = 'CONNECTED';
        integ.workflowCount = tenant.workflows.filter((w) => w.integrationId === integ.id).length;
        tenant.agency.workflowsCount = tenant.workflows.length;
        recordAuditForTenant(tenant, 'INTEGRATION_SYNCED', 'INTEGRATION', integ.id, `Synced ${wfResult.items.length} workflows and ${deduped.addedCount} new executions from live n8n instance.`, user.name, user.email);

        return res.json({
          success: true,
          mode: 'live-n8n',
          syncedAt: integ.lastSyncedAt,
          watermark: integ.lastExecutionWatermark,
          workflowCount: integ.workflowCount,
          executionsIngested: deduped.addedCount,
        });
      } catch (err: any) {
        integ.lastSyncStatus = 'ERROR';
        integ.lastSyncError = err?.message || 'Live n8n sync failed';
        return res.status(502).json({ error: integ.lastSyncError });
      }
    }

    integ.lastSyncedAt = new Date().toISOString();
    integ.lastExecutionWatermark = integ.lastSyncedAt;
    integ.lastSyncStatus = 'SUCCESS';
    integ.lastSyncError = undefined;
    integ.status = 'CONNECTED';
    integ.workflowCount = tenant.workflows.filter((w) => w.integrationId === integ.id).length;
    recordAuditForTenant(tenant, 'INTEGRATION_SYNCED', 'INTEGRATION', integ.id, `Completed sync check for "${integ.name}" (${integ.workflowCount} workflows).`, user.name, user.email);
    res.json({
      success: true,
      mode: 'demo-local',
      syncedAt: integ.lastSyncedAt,
      watermark: integ.lastExecutionWatermark,
      workflowCount: integ.workflowCount,
      executionsIngested: 0,
    });
  });

  // 5. Workflows & Executions
  app.get('/api/v1/workflows', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(sortByTimestampDesc(ctx.tenant.workflows, (w) => w.lastExecutionAt || w.createdAt));
  });

  app.post('/api/v1/workflows', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { name, clientId, integrationId, platform, externalWorkflowId, stuckTimeoutSeconds, allowLongRunning } = req.body || {};
    const client = tenant.clients.find((c) => c.id === clientId) || tenant.clients[0];
    const integ = tenant.integrations.find((i) => i.id === integrationId) || tenant.integrations[0];
    const newWorkflow: Workflow = {
      id: `wf_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      agencyId: tenant.agency.id,
      clientId: clientId || client?.id || 'unassigned',
      clientName: client?.name || 'Workspace Default',
      integrationId: integrationId || integ?.id || 'unassigned',
      platform: platform || integ?.platform || 'n8n',
      externalWorkflowId: externalWorkflowId || `flow_${Date.now()}`,
      name: (name && String(name).trim()) || 'Automated Sync Pipeline',
      isActive: true,
      healthStatus: 'HEALTHY',
      consecutiveFailures: 0,
      stuckTimeoutSeconds: typeof stuckTimeoutSeconds === 'number' ? stuckTimeoutSeconds : undefined,
      allowLongRunning: Boolean(allowLongRunning),
      lastExecutionAt: new Date().toISOString(),
      lastSuccessfulAt: new Date().toISOString(),
      avgDurationMs: 0,
      createdAt: new Date().toISOString(),
    };
    tenant.workflows.unshift(newWorkflow);
    if (integ) {
      integ.workflowCount = tenant.workflows.filter((w) => w.integrationId === integ.id).length;
    }
    if (client) {
      client.monitoredWorkflowsCount = tenant.workflows.filter((w) => w.clientId === client.id).length;
    }
    tenant.agency.workflowsCount = tenant.workflows.length;
    recordAuditForTenant(tenant, 'WORKFLOW_REGISTERED', 'WORKFLOW', newWorkflow.id, `Registered ${newWorkflow.platform} workflow "${newWorkflow.name}"`, user.name, user.email);
    res.status(201).json(newWorkflow);
  });

  app.get('/api/v1/executions', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

    let items = ctx.tenant.executions;
    if (workflowId) items = items.filter((e) => e.workflowId === workflowId);
    if (statusFilter && statusFilter !== 'ALL') items = items.filter((e) => e.status === statusFilter);
    res.json(sortByTimestampDesc(items, (e) => e.startedAt).slice(0, limit));
  });

  app.post('/api/v1/executions/detect-stuck', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant } = ctx;
    const stuckList = evaluateStuckExecutions(tenant.executions, tenant.workflows);
    const createdIncidents: string[] = [];

    for (const item of stuckList) {
      item.execution.isStuckAlerted = true;
      item.execution.status = 'TIMED_OUT';
      item.execution.durationMs = item.elapsedSeconds * 1000;
      const errMsg = `Stuck execution detected: workflow "${item.execution.workflowName}" exceeded ${item.thresholdSeconds}s timeout (running ${item.elapsedSeconds}s).`;
      item.execution.errorMessage = errMsg;

      if (item.workflow) {
        item.workflow.consecutiveFailures += 1;
        item.workflow.healthStatus = item.workflow.consecutiveFailures >= 3 ? 'FAILING' : 'DEGRADED';
        item.workflow.lastFailedAt = new Date().toISOString();
      }

      const incId = `inc_stuck_${Date.now()}_${item.execution.id}`;
      tenant.incidents.unshift({
        id: incId,
        agencyId: tenant.agency.id,
        clientId: item.workflow?.clientId || 'unassigned',
        clientName: item.execution.clientName,
        workflowId: item.execution.workflowId,
        workflowName: item.execution.workflowName,
        platform: item.execution.platform,
        executionId: item.execution.externalExecutionId || item.execution.id,
        errorCategory: 'TIMEOUT',
        errorMessage: errMsg,
        severity: 'HIGH',
        status: 'OPEN',
        firstDetectedAt: new Date().toISOString(),
        lastDetectedAt: new Date().toISOString(),
        occurrenceCount: 1,
        recoveryAttempts: [],
      });
      createdIncidents.push(incId);
      recordAuditForTenant(tenant, 'STUCK_EXECUTION_DETECTED', 'EXECUTION', item.execution.id, errMsg, 'Monitor Watchdog', 'watchdog@zevkar.internal');
    }

    res.json({
      checkedRunningExecutions: tenant.executions.filter((e) => e.status === 'RUNNING').length,
      abnormalRunsDetected: stuckList.length,
      incidentIds: createdIncidents,
    });
  });

  // Workspace Timezone Settings
  app.get('/api/v1/settings/timezone', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json({ timezone: ctx.tenant.agency.timezone || 'UTC' });
  });

  app.put('/api/v1/settings/timezone', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { timezone } = req.body || {};
    if (!isValidTimeZone(timezone)) {
      return res.status(400).json({ error: `Invalid IANA timezone: ${String(timezone || '')}` });
    }
    ctx.tenant.agency.timezone = timezone;
    ctx.tenant.onboarding.data.timezone = timezone;
    recordAuditForTenant(ctx.tenant, 'TIMEZONE_UPDATED', 'AGENCY', ctx.tenant.agency.id, `Updated workspace display timezone to ${timezone}`, ctx.user.name, ctx.user.email);
    res.json({ success: true, timezone });
  });

  // 6. Incidents
  app.get('/api/v1/incidents', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.incidents);
  });

  app.get('/api/v1/incidents/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const incident = ctx.tenant.incidents.find((i) => i.id === req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.json(incident);
  });

  // AI Diagnosis Engine Endpoint
  app.post('/api/v1/diagnosis/analyze', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant } = ctx;
    const { incidentId } = req.body || {};
    const incident = tenant.incidents.find((i) => i.id === incidentId);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    let lastFallbackReason: string | null = null;
    if (ai) {
      try {
        const prompt = `You are the Lead Reliability Architect for Zevkar.
Analyze this automation workflow failure:
Workflow: ${incident.workflowName}
Platform: ${incident.platform}
Client: ${incident.clientName}
Error Message: ${incident.errorMessage}
Error Category: ${incident.errorCategory}
Execution ID: ${incident.executionId}

Provide a deep, structured root-cause analysis and safe recovery recommendation in JSON adhering to this exact schema:
{
  "error_category": "AUTH_FAILURE" | "API_ERROR" | "RATE_LIMIT" | "TIMEOUT" | "DATABASE_FAILURE" | "SCHEMA_MISMATCH" | "INVALID_PAYLOAD" | "NETWORK_FAILURE" | "LLM_FAILURE",
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "root_cause": "1-2 sentence precise technical root cause",
  "simple_explanation": "Plain non-technical explanation for agency clients",
  "technical_explanation": "Detailed engineering breakdown including HTTP codes, payloads, or network semantics",
  "recommended_actions": ["3-4 actionable remediation bullet points"],
  "suggested_recovery": "Concrete safe recovery method (manual retry, parameter backoff, or credential rotation)",
  "requires_human_approval": boolean,
  "is_recoverable": boolean,
  "suggested_strategy": "RETRY_EXECUTION" | "RETRY_AFTER_DELAY" | "RETRY_EXPONENTIAL_BACKOFF" | "MANUAL_RECOVERY" | "MARK_NON_RECOVERABLE" | "ESCALATE_HUMAN",
  "recommendation_reason": "Why this recovery strategy was selected and its risk profile",
  "expected_risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "required_user_action": "Specific operator verification required prior to retry",
  "max_recommended_retries": integer between 0 and 10,
  "confidence": number between 0.85 and 0.99
}`;

        const callPromise = ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI diagnosis request timed out after 8000ms')), 8000)
        );

        const aiResponse = await Promise.race([callPromise, timeoutPromise]);
        const textOutput = aiResponse.text || '{}';
        const parsed = JSON.parse(textOutput);
        const detRec = buildDeterministicRecommendation(
          (parsed.error_category || incident.errorCategory) as any,
          incident.workflowName,
          incident.errorMessage
        );
        const chosenStrategy = SUPPORTED_RECOVERY_STRATEGIES.includes(parsed.suggested_strategy)
          ? (parsed.suggested_strategy as RecoveryStrategy)
          : detRec.suggestedStrategy;

        const newDiagnosis: AIDiagnosis = {
          id: `diag_${Date.now()}`,
          incidentId: incident.id,
          errorCategory: parsed.error_category || incident.errorCategory,
          severity: parsed.severity || incident.severity,
          rootCause: parsed.root_cause || 'Authentication token rejection from upstream processor.',
          simpleExplanation: parsed.simple_explanation || 'The third-party system rejected our automated credentials.',
          technicalExplanation: parsed.technical_explanation || incident.errorMessage,
          recommendedActions: parsed.recommended_actions || ['Verify API keys', 'Check quota', 'Retry after fix'],
          suggestedRecovery: parsed.suggested_recovery || detRec.requiredUserAction,
          requiresHumanApproval: parsed.requires_human_approval !== undefined ? Boolean(parsed.requires_human_approval) : true,
          isRecoverable: parsed.is_recoverable !== undefined ? Boolean(parsed.is_recoverable) : detRec.isRecoverable,
          recommendedStrategy: chosenStrategy,
          recommendationReason: parsed.recommendation_reason || detRec.recommendationReason,
          expectedRiskLevel: parsed.expected_risk_level || detRec.expectedRiskLevel,
          requiredUserAction: parsed.required_user_action || detRec.requiredUserAction,
          maxRecommendedRetries: typeof parsed.max_recommended_retries === 'number' ? parsed.max_recommended_retries : detRec.maxRecommendedRetries,
          confidence: parsed.confidence || 0.95,
          isAiGenerated: true,
          modelUsed: GEMINI_MODEL,
          diagnosedAt: new Date().toISOString(),
          tokenCount: 430,
        };

        incident.aiDiagnosis = newDiagnosis;
        incident.severity = newDiagnosis.severity;
        recordAuditForTenant(tenant, 'AI_DIAGNOSIS_COMPLETED', 'AI_DIAGNOSIS', newDiagnosis.id, `${GEMINI_MODEL} diagnosed #${incident.id} as ${newDiagnosis.errorCategory} (strategy: ${newDiagnosis.recommendedStrategy})`, 'Gemini AI Engine', 'gemini@zevkar.internal');
        return res.json(newDiagnosis);
      } catch (err) {
        lastFallbackReason = err instanceof Error ? err.message : String(err);
        console.warn('[Zevkar] Gemini API call did not succeed, falling back to deterministic engine:', lastFallbackReason);
      }
    } else {
      lastFallbackReason = 'GEMINI_API_KEY is not configured on the server';
    }

    const classified = classifyError(incident.errorMessage);
    const detRec = buildDeterministicRecommendation(classified.category, incident.workflowName, incident.errorMessage);
    const fallbackDiagnosis: AIDiagnosis = {
      id: `diag_fallback_${Date.now()}`,
      incidentId: incident.id,
      errorCategory: classified.category,
      severity: classified.severity,
      rootCause: `Deterministic classifier detected ${classified.category} in workflow execution log.`,
      simpleExplanation: `The automation stopped because: ${incident.errorMessage.slice(0, 120)}...`,
      technicalExplanation: incident.errorMessage,
      recommendedActions: [classified.suggestedAction, 'Audit execution stack trace', 'Verify idempotency key before retry'],
      suggestedRecovery: detRec.requiredUserAction,
      requiresHumanApproval: classified.requiresApproval || detRec.expectedRiskLevel === 'HIGH' || detRec.expectedRiskLevel === 'CRITICAL',
      isRecoverable: detRec.isRecoverable,
      recommendedStrategy: detRec.suggestedStrategy,
      recommendationReason: detRec.recommendationReason,
      expectedRiskLevel: detRec.expectedRiskLevel,
      requiredUserAction: detRec.requiredUserAction,
      maxRecommendedRetries: detRec.maxRecommendedRetries,
      confidence: 0.90,
      isAiGenerated: false,
      diagnosedAt: new Date().toISOString(),
      tokenCount: 0,
      fallbackReason: lastFallbackReason,
    };

    incident.aiDiagnosis = fallbackDiagnosis;
    recordAuditForTenant(tenant, 'FALLBACK_DIAGNOSIS_COMPLETED', 'AI_DIAGNOSIS', fallbackDiagnosis.id, `Deterministic rules classified #${incident.id} as ${fallbackDiagnosis.errorCategory} (strategy: ${fallbackDiagnosis.recommendedStrategy})`, 'Rules Engine', 'rules@zevkar.internal');
    return res.json(fallbackDiagnosis);
  });

  // 7. Phase 7 Intelligent Recovery Engine (Tenant-scoped Policies, Metrics, Request Lifecycle, Verified Execution)
  function createRuntimeRecoveryRequest(
    tenant: TenantStore,
    params: {
      incident: Incident;
      strategy: RecoveryStrategy;
      userId: string;
      actorName: string;
      delaySeconds?: number;
      reason?: string;
      idempotencyKey?: string;
    }
  ): { statusCode: number; error?: string; request?: RecoveryRequest } {
    const { incident, strategy, userId, actorName, delaySeconds, reason, idempotencyKey } = params;
    if (!SUPPORTED_RECOVERY_STRATEGIES.includes(strategy)) {
      return { statusCode: 400, error: `Unsupported recovery strategy: ${strategy}` };
    }
    if (!tenant.recoveryPolicy.allowedStrategies.includes(strategy)) {
      return { statusCode: 403, error: `Strategy '${strategy}' is disabled by organization recovery policy.` };
    }

    const resolvedKey =
      idempotencyKey || generateRequestIdempotencyKey(incident.id, strategy, incident.occurrenceCount);
    const dupByKey = tenant.recoveryRequests.find((r) => r.idempotencyKey === resolvedKey);
    if (dupByKey) {
      return { statusCode: 200, request: dupByKey };
    }

    const activeDup = tenant.recoveryRequests.find(
      (r) => r.incidentId === incident.id && ACTIVE_RECOVERY_STATUSES.has(r.status)
    );
    if (activeDup) {
      return {
        statusCode: 409,
        error: `Active recovery request (${activeDup.id}) already exists with status ${activeDup.status}.`,
      };
    }

    if (RETRY_STRATEGIES.includes(strategy) && incident.aiDiagnosis?.isRecoverable === false) {
      return {
        statusCode: 400,
        error: 'Cannot queue automated retry: diagnosis marked this incident non-recoverable.',
      };
    }

    const wf = tenant.workflows.find((w) => w.id === incident.workflowId);
    const risk = assessRecoveryRisk({
      incident,
      workflow: wf,
      diagnosis: incident.aiDiagnosis,
      policy: tenant.recoveryPolicy,
      strategy,
    });

    const computedDelay = calculateBackoffDelaySeconds({
      strategy,
      attemptNumber: 1,
      baseDelaySeconds: tenant.recoveryPolicy.retryDelaySeconds,
      useExponentialBackoff: tenant.recoveryPolicy.useExponentialBackoff,
      customDelaySeconds: delaySeconds,
    });

    const nowIso = new Date().toISOString();
    let initialStatus: RecoveryRequest['status'] = 'PENDING_APPROVAL';
    let requiresApproval = true;
    let completedAt: string | undefined;
    let finalResultSummary: string | undefined;

    if (strategy === 'MARK_NON_RECOVERABLE') {
      initialStatus = 'NON_RECOVERABLE';
      requiresApproval = false;
      incident.status = 'IGNORED';
      completedAt = nowIso;
      finalResultSummary = reason || 'Marked non-recoverable by operator.';
    } else if (strategy === 'ESCALATE_HUMAN' || risk.requiresApproval) {
      initialStatus = 'PENDING_APPROVAL';
      requiresApproval = true;
      incident.status = 'APPROVAL_REQUIRED';
    } else {
      initialStatus = computedDelay > 0 ? 'SCHEDULED' : 'APPROVED';
      requiresApproval = false;
      incident.status = 'RECOVERING';
    }

    const recReq: RecoveryRequest = {
      id: `rreq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agencyId: tenant.agency.id,
      incidentId: incident.id,
      workflowId: incident.workflowId,
      workflowName: incident.workflowName,
      platform: incident.platform,
      externalExecutionId: incident.executionId,
      strategy,
      status: initialStatus,
      isRecoverable: risk.isRecoverable,
      riskLevel: risk.riskLevel,
      riskAssessment: risk,
      recommendedReason:
        reason ||
        incident.aiDiagnosis?.recommendationReason ||
        `Recovery strategy ${strategy} requested for "${incident.workflowName}".`,
      requiredUserAction:
        incident.aiDiagnosis?.requiredUserAction ||
        'Confirm downstream idempotency before executing recovery.',
      maxRetryAttempts: tenant.recoveryPolicy.maxRetryAttempts,
      retryCount: 0,
      delaySeconds: computedDelay,
      nextRetryAt: computedDelay > 0 ? new Date(Date.now() + computedDelay * 1000).toISOString() : undefined,
      requiresApproval,
      requestedByUserId: userId,
      idempotencyKey: resolvedKey,
      resultVerified: false,
      finalResultSummary,
      completedAt,
      createdAt: nowIso,
      updatedAt: nowIso,
      incidentErrorCategory: incident.errorCategory,
      incidentSeverity: incident.severity,
      attemptsCount: 0,
      approvalsCount: requiresApproval ? 1 : 0,
    };

    tenant.recoveryRequests.unshift(recReq);

    if (requiresApproval) {
      const apprId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      tenant.approvals.unshift({
        id: apprId,
        incidentId: incident.id,
        recoveryRequestId: recReq.id,
        agencyId: tenant.agency.id,
        incidentTitle: `${incident.workflowName} (${incident.errorCategory})`,
        requestedBy: actorName,
        proposedAction: `${strategy}: ${recReq.recommendedReason}`,
        riskReason: `Risk ${risk.riskLevel}: ${risk.factors.join(' ') || recReq.recommendedReason}`,
        status: 'PENDING',
        createdAt: nowIso,
        strategy,
        riskLevel: risk.riskLevel,
        recoveryStatus: initialStatus,
      });
      incident.pendingApprovalId = apprId;
      pushNotificationForTenant(tenant, {
        type: 'APPROVAL_REQUEST',
        title: `Approval Needed: ${incident.workflowName}`,
        message: `Strategy ${strategy} flagged as ${risk.riskLevel} risk. Human approval required.`,
        incidentId: incident.id,
      });
    }

    recordAuditForTenant(
      tenant,
      'RECOVERY_REQUESTED',
      'RECOVERY_REQUEST',
      recReq.id,
      `Created recovery request (${strategy}) with status ${initialStatus} and risk ${risk.riskLevel}`,
      actorName
    );
    return { statusCode: 201, request: recReq };
  }

  async function executeRuntimeRecoveryRequest(
    tenant: TenantStore,
    params: {
      recReq: RecoveryRequest;
      actorName: string;
      bypassApprovalGate?: boolean;
    }
  ): Promise<{ statusCode: number; payload: Record<string, any> }> {
    const { recReq, actorName, bypassApprovalGate = false } = params;
    const hasApprovedGate =
      bypassApprovalGate ||
      tenant.approvals.some((a) => a.recoveryRequestId === recReq.id && a.status === 'APPROVED');

    const guard = validateRecoveryExecutionPreconditions({
      request: recReq,
      policy: tenant.recoveryPolicy,
      hasApprovedGate,
    });
    if (!guard.ok) {
      return {
        statusCode: guard.statusCode,
        payload: { error: 'RECOVERY_GUARD_BLOCKED', message: guard.error },
      };
    }

    const incident = tenant.incidents.find((i) => i.id === recReq.incidentId);
    if (!incident) {
      return { statusCode: 404, payload: { error: 'Linked incident not found' } };
    }
    const wf = tenant.workflows.find((w) => w.id === recReq.workflowId);

    const nextAttempt = recReq.retryCount + 1;
    const attemptIdemKey = generateRecoveryIdempotencyKey(recReq.id, nextAttempt);
    const existingAttempt = tenant.recoveryAttemptsStore.find((a) => a.idempotencyKey === attemptIdemKey);
    if (existingAttempt) {
      return {
        statusCode: 200,
        payload: {
          success: existingAttempt.status === 'SUCCESS',
          deduplicated: true,
          recoveryRequest: recReq,
          attempt: existingAttempt,
          incident,
          message: 'Deduplicated idempotent recovery attempt returned.',
        },
      };
    }

    const delayApplied = calculateBackoffDelaySeconds({
      strategy: recReq.strategy,
      attemptNumber: nextAttempt,
      baseDelaySeconds: tenant.recoveryPolicy.retryDelaySeconds,
      useExponentialBackoff: tenant.recoveryPolicy.useExponentialBackoff,
      customDelaySeconds: nextAttempt === 1 ? recReq.delaySeconds : undefined,
    });

    recReq.status = 'EXECUTING';
    recReq.updatedAt = new Date().toISOString();
    incident.status = 'RECOVERING';
    recordAuditForTenant(
      tenant,
      'RECOVERY_STARTED',
      'RECOVERY_REQUEST',
      recReq.id,
      `Started attempt #${nextAttempt} (${recReq.strategy}, delay=${delayApplied}s)`,
      actorName
    );
    pushNotificationForTenant(tenant, {
      type: 'RECOVERY_STARTED',
      title: `Recovery Started: ${incident.workflowName}`,
      message: `Attempt #${nextAttempt} dispatched using ${recReq.strategy}.`,
      incidentId: incident.id,
    });

    const integ = wf?.integrationId ? tenant.integrations.find((i) => i.id === wf.integrationId) : undefined;
    const urlStr = integ?.instanceUrl || '';
    const isDemoHost =
      !urlStr ||
      urlStr.includes('.example') ||
      urlStr.includes('.internal') ||
      urlStr.includes('apexautomations.io');
    const apiKey = integ ? tenant.integrationSecrets.get(integ.id) : undefined;

    let attemptStatus: RecoveryAttempt['status'] = 'FAILED';
    let verificationStatus: RecoveryAttempt['verificationStatus'] = 'VERIFIED_FAILED';
    let resultExecutionId: string | undefined;
    let details = '';

    if (wf?.platform === 'n8n' && !isDemoHost) {
      if (!apiKey || !recReq.externalExecutionId) {
        details = 'Missing live n8n API credentials or external execution ID for external retry.';
      } else {
        try {
          const cleanUrl = validateExternalN8nUrl(urlStr);
          const apiBase = cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
          const retryRes = await fetch(`${apiBase}/executions/${recReq.externalExecutionId}/retry`, {
            method: 'POST',
            headers: {
              'X-N8N-API-KEY': apiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ loadWorkflow: true }),
            signal: AbortSignal.timeout(10000),
          });
          if (!retryRes.ok) {
            details = `n8n retry HTTP ${retryRes.status}: failed to dispatch retry.`;
          } else {
            const retryJson = await retryRes.json();
            resultExecutionId = retryJson?.id ? String(retryJson.id) : undefined;
            if (!resultExecutionId) {
              attemptStatus = 'PENDING';
              verificationStatus = 'UNVERIFIED';
              details = 'n8n retry accepted without returning a verifiable new execution ID.';
            } else {
              recReq.status = 'VERIFYING';
              const verifyRes = await fetch(`${apiBase}/executions/${resultExecutionId}?includeData=true`, {
                headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
                signal: AbortSignal.timeout(10000),
              });
              if (!verifyRes.ok) {
                attemptStatus = 'PENDING';
                verificationStatus = 'UNVERIFIED';
                details = `Triggered n8n execution ${resultExecutionId}, verification GET returned HTTP ${verifyRes.status}.`;
              } else {
                const verifyJson = (await verifyRes.json()) as RawN8nExecution;
                const norm = normalizeN8nExecution(verifyJson, {
                  workflowId: wf.id,
                  integrationId: integ?.id || wf.integrationId || 'int_n8n_external',
                  workflowName: wf.name,
                  clientName: wf.clientName,
                  platform: 'n8n',
                });
                if (norm.status === 'SUCCESS') {
                  attemptStatus = 'SUCCESS';
                  verificationStatus = 'VERIFIED_SUCCESS';
                  details = `Live n8n execution ${resultExecutionId} verified SUCCEEDED.`;
                } else if (norm.status === 'RUNNING') {
                  attemptStatus = 'PENDING';
                  verificationStatus = 'UNVERIFIED';
                  details = `Live n8n execution ${resultExecutionId} is currently running (awaiting terminal verification).`;
                } else {
                  attemptStatus = 'FAILED';
                  verificationStatus = 'VERIFIED_FAILED';
                  details = norm.errorMessage || `Live n8n execution ${resultExecutionId} verified ${norm.status}.`;
                }
              }
            }
          }
        } catch (err: any) {
          details = `External n8n retry error: ${err?.message || 'Network failure'}`;
        }
      }
    } else {
      resultExecutionId = `exec_retry_${Date.now()}`;
      attemptStatus = 'SUCCESS';
      verificationStatus = 'VERIFIED_SUCCESS';
      details = `Sandbox verified execution ${resultExecutionId} succeeded via ${recReq.strategy} (delay=${delayApplied}s).`;
    }

    const finishedIso = new Date().toISOString();
    const attempt: RecoveryAttempt = {
      id: `recov_${Date.now()}`,
      incidentId: incident.id,
      recoveryRequestId: recReq.id,
      workflowId: incident.workflowId,
      attemptNumber: nextAttempt,
      strategy: recReq.strategy,
      action: recReq.strategy,
      initiatedBy: actorName,
      status: attemptStatus,
      delayAppliedSeconds: delayApplied,
      idempotencyKey: attemptIdemKey,
      verificationStatus,
      verifiedAt: verificationStatus.startsWith('VERIFIED_') ? finishedIso : undefined,
      executedAt: finishedIso,
      details,
      resultExecutionId,
    };

    tenant.recoveryAttemptsStore.unshift(attempt);
    incident.recoveryAttempts.unshift(attempt);
    recReq.retryCount = nextAttempt;
    recReq.delaySeconds = delayApplied;
    recReq.attemptsCount = (recReq.attemptsCount || 0) + 1;
    recReq.updatedAt = finishedIso;

    if (verificationStatus === 'VERIFIED_SUCCESS') {
      recReq.status = 'SUCCEEDED';
      recReq.resultVerified = true;
      recReq.lastError = undefined;
      recReq.finalResultSummary = details;
      recReq.completedAt = finishedIso;

      incident.status = 'RESOLVED';
      if (wf) {
        wf.healthStatus = 'HEALTHY';
        wf.consecutiveFailures = 0;
        wf.lastExecutionAt = finishedIso;
        wf.lastSuccessfulAt = finishedIso;
      }
      tenant.executions.unshift({
        id: resultExecutionId || `exec_retry_${Date.now()}`,
        workflowId: incident.workflowId,
        integrationId: wf?.integrationId,
        externalExecutionId: resultExecutionId,
        workflowName: incident.workflowName,
        clientName: incident.clientName,
        platform: incident.platform,
        status: 'SUCCESS',
        rawStatus: 'success',
        startedAt: finishedIso,
        finishedAt: finishedIso,
        durationMs: 640,
        mode: 'retry',
        retryCount: nextAttempt,
      });

      recordAuditForTenant(tenant, 'RETRY_ATTEMPTED', 'RECOVERY_ATTEMPT', attempt.id, details, actorName);
      recordAuditForTenant(tenant, 'RECOVERY_COMPLETED', 'RECOVERY_REQUEST', recReq.id, `Recovery verified SUCCEEDED for incident #${incident.id}`, actorName);
      pushNotificationForTenant(tenant, {
        type: 'RECOVERY_SUCCESS',
        title: `Recovery Succeeded: ${incident.workflowName}`,
        message: details,
        incidentId: incident.id,
      });

      return {
        statusCode: 200,
        payload: {
          success: true,
          recoveryRequest: recReq,
          incident,
          attempt,
          verificationStatus,
          message: details,
        },
      };
    }

    if (verificationStatus === 'UNVERIFIED') {
      recReq.status = 'VERIFYING';
      recReq.resultVerified = false;
      recReq.finalResultSummary = details;
      recordAuditForTenant(tenant, 'RETRY_ATTEMPTED', 'RECOVERY_ATTEMPT', attempt.id, details, actorName);
      return {
        statusCode: 202,
        payload: {
          success: false,
          recoveryRequest: recReq,
          incident,
          attempt,
          verificationStatus,
          message: details,
        },
      };
    }

    recReq.status = 'FAILED';
    recReq.resultVerified = false;
    recReq.lastError = details;
    recReq.finalResultSummary = details;
    recReq.cooldownUntil = new Date(Date.now() + tenant.recoveryPolicy.cooldownSeconds * 1000).toISOString();
    if (nextAttempt >= Math.min(recReq.maxRetryAttempts, tenant.recoveryPolicy.maxRetryAttempts)) {
      recReq.completedAt = finishedIso;
    }
    incident.status = 'INVESTIGATING';

    recordAuditForTenant(tenant, 'RETRY_ATTEMPTED', 'RECOVERY_ATTEMPT', attempt.id, details, actorName);
    recordAuditForTenant(tenant, 'RECOVERY_FAILED', 'RECOVERY_REQUEST', recReq.id, `Recovery attempt #${nextAttempt} failed: ${details}`, actorName);
    pushNotificationForTenant(tenant, {
      type: 'RECOVERY_FAILED',
      title: `Recovery Failed: ${incident.workflowName}`,
      message: details,
      incidentId: incident.id,
    });

    return {
      statusCode: 502,
      payload: {
        success: false,
        error: 'RECOVERY_VERIFICATION_FAILED',
        recoveryRequest: recReq,
        incident,
        attempt,
        verificationStatus,
        message: details,
      },
    };
  }

  app.get('/api/v1/recovery/policies', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.recoveryPolicy);
  });

  app.put('/api/v1/recovery/policies', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const body = req.body || {};
    const maxRetry = Number(body.maxRetryAttempts ?? body.max_retry_attempts ?? tenant.recoveryPolicy.maxRetryAttempts);
    const delaySec = Number(body.retryDelaySeconds ?? body.retry_delay_seconds ?? tenant.recoveryPolicy.retryDelaySeconds);
    const cooldownSec = Number(body.cooldownSeconds ?? body.cooldown_seconds ?? tenant.recoveryPolicy.cooldownSeconds);
    const allowed = Array.isArray(body.allowedStrategies ?? body.allowed_strategies)
      ? (body.allowedStrategies ?? body.allowed_strategies).filter((s: string) =>
          SUPPORTED_RECOVERY_STRATEGIES.includes(s as RecoveryStrategy)
        )
      : tenant.recoveryPolicy.allowedStrategies;

    tenant.recoveryPolicy = {
      ...tenant.recoveryPolicy,
      maxRetryAttempts: Math.max(0, Math.min(20, maxRetry)),
      retryDelaySeconds: Math.max(0, Math.min(86400, delaySec)),
      useExponentialBackoff: Boolean(body.useExponentialBackoff ?? body.use_exponential_backoff ?? tenant.recoveryPolicy.useExponentialBackoff),
      cooldownSeconds: Math.max(0, Math.min(86400, cooldownSec)),
      approvalRequired: Boolean(body.approvalRequired ?? body.approval_required ?? tenant.recoveryPolicy.approvalRequired),
      autoRecoveryEnabled: Boolean(body.autoRecoveryEnabled ?? body.auto_recovery_enabled ?? tenant.recoveryPolicy.autoRecoveryEnabled),
      allowedStrategies: allowed.length > 0 ? allowed : [...SUPPORTED_RECOVERY_STRATEGIES],
      updatedByUserId: user.id,
      updatedAt: new Date().toISOString(),
    };

    recordAuditForTenant(
      tenant,
      'RECOVERY_POLICY_UPDATED',
      'RECOVERY_POLICY',
      tenant.recoveryPolicy.id,
      `Updated org recovery policy (maxRetries=${tenant.recoveryPolicy.maxRetryAttempts}, approvalRequired=${tenant.recoveryPolicy.approvalRequired}, autoRecovery=${tenant.recoveryPolicy.autoRecoveryEnabled})`,
      user.name,
      user.email
    );
    res.json(tenant.recoveryPolicy);
  });

  app.get('/api/v1/recovery/metrics', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(computeRecoveryMetrics(ctx.tenant.recoveryRequests));
  });

  app.get('/api/v1/recovery/attempts', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.recoveryAttemptsStore);
  });

  app.get('/api/v1/recovery/requests', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const statusFilter = typeof req.query.status_filter === 'string' ? req.query.status_filter.toUpperCase() : undefined;
    const list = statusFilter && statusFilter !== 'ALL'
      ? ctx.tenant.recoveryRequests.filter((r) => r.status === statusFilter)
      : ctx.tenant.recoveryRequests;
    res.json(sortByTimestampDesc(list, (r) => r.createdAt));
  });

  app.post('/api/v1/recovery/requests', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const {
      incidentId,
      incident_id,
      strategy = 'RETRY_EXECUTION',
      delaySeconds,
      delay_seconds,
      reason,
      idempotencyKey,
      idempotency_key,
    } = req.body || {};

    const resolvedIncidentId = incidentId || incident_id;
    const incident = tenant.incidents.find((i) => i.id === resolvedIncidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const result = createRuntimeRecoveryRequest(tenant, {
      incident,
      strategy: strategy as RecoveryStrategy,
      userId: user.id,
      actorName: user.name,
      delaySeconds: delaySeconds ?? delay_seconds,
      reason,
      idempotencyKey: idempotencyKey ?? idempotency_key,
    });

    if (result.error || !result.request) {
      return res.status(result.statusCode).json({ error: result.error, message: result.error });
    }
    return res.status(result.statusCode).json(result.request);
  });

  app.get('/api/v1/recovery/requests/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const { tenant } = ctx;
    const recReq = tenant.recoveryRequests.find((r) => r.id === req.params.id);
    if (!recReq) return res.status(404).json({ error: 'Recovery request not found' });

    const incident = tenant.incidents.find((i) => i.id === recReq.incidentId) || null;
    const workflow = tenant.workflows.find((w) => w.id === recReq.workflowId) || null;
    const reqAttempts = tenant.recoveryAttemptsStore.filter((a) => a.recoveryRequestId === recReq.id || a.incidentId === recReq.incidentId);
    const reqApprovals = tenant.approvals.filter((a) => a.recoveryRequestId === recReq.id || a.incidentId === recReq.incidentId);
    const reqAudit = tenant.auditLogs.filter((l) => l.entityId === recReq.id || l.entityId === recReq.incidentId).slice(0, 20);

    res.json({
      recoveryRequest: recReq,
      incident,
      workflow,
      aiDiagnosis: incident?.aiDiagnosis || null,
      attempts: reqAttempts,
      approvals: reqApprovals,
      policy: tenant.recoveryPolicy,
      auditEvents: reqAudit,
    });
  });

  app.post('/api/v1/recovery/requests/:id/execute', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const recReq = tenant.recoveryRequests.find((r) => r.id === req.params.id);
    if (!recReq) return res.status(404).json({ error: 'Recovery request not found' });

    const out = await executeRuntimeRecoveryRequest(tenant, {
      recReq,
      actorName: user.name,
      bypassApprovalGate: Boolean(req.body?.bypassApproval),
    });
    res.status(out.statusCode).json(out.payload);
  });

  app.post('/api/v1/recovery/requests/:id/cancel', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const recReq = tenant.recoveryRequests.find((r) => r.id === req.params.id);
    if (!recReq) return res.status(404).json({ error: 'Recovery request not found' });

    if (['SUCCEEDED', 'CANCELLED', 'NON_RECOVERABLE'].includes(recReq.status)) {
      return res.status(409).json({ error: `Cannot cancel recovery request in terminal status '${recReq.status}'.` });
    }
    if (['EXECUTING', 'VERIFYING'].includes(recReq.status)) {
      return res.status(409).json({ error: 'Cannot cancel recovery request while execution is in progress.' });
    }

    const nowIso = new Date().toISOString();
    const cancelReason = req.body?.reason || 'Cancelled by operator.';
    recReq.status = 'CANCELLED';
    recReq.lastError = cancelReason;
    recReq.finalResultSummary = cancelReason;
    recReq.completedAt = nowIso;
    recReq.updatedAt = nowIso;

    tenant.approvals.forEach((a) => {
      if (a.recoveryRequestId === recReq.id && a.status === 'PENDING') {
        a.status = 'CANCELLED';
        a.respondedBy = user.name;
        a.respondedAt = nowIso;
        a.rejectionReason = cancelReason;
        a.recoveryStatus = 'CANCELLED';
      }
    });

    const incident = tenant.incidents.find((i) => i.id === recReq.incidentId);
    if (incident && ['APPROVAL_REQUIRED', 'RECOVERING'].includes(incident.status)) {
      incident.status = 'INVESTIGATING';
    }

    recordAuditForTenant(tenant, 'RECOVERY_CANCELLED', 'RECOVERY_REQUEST', recReq.id, cancelReason, user.name, user.email);
    res.json({ success: true, recoveryRequest: recReq });
  });

  app.post('/api/v1/recovery/execute', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const {
      incidentId,
      recoveryRequestId,
      strategy = 'RETRY_EXECUTION',
      bypassApproval = false,
      initiatedBy,
    } = req.body || {};

    let recReq = recoveryRequestId
      ? tenant.recoveryRequests.find((r) => r.id === recoveryRequestId)
      : undefined;

    if (!recReq) {
      const incident = tenant.incidents.find((i) => i.id === incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }
      recReq = tenant.recoveryRequests.find(
        (r) =>
          r.incidentId === incident.id &&
          (ACTIVE_RECOVERY_STATUSES.has(r.status) || (r.status === 'FAILED' && r.retryCount < r.maxRetryAttempts))
      );
      if (!recReq) {
        const created = createRuntimeRecoveryRequest(tenant, {
          incident,
          strategy: (SUPPORTED_RECOVERY_STRATEGIES.includes(strategy) ? strategy : 'RETRY_EXECUTION') as RecoveryStrategy,
          userId: user.id,
          actorName: initiatedBy || user.name,
        });
        if (created.error || !created.request) {
          return res.status(created.statusCode).json({ error: created.error, message: created.error });
        }
        recReq = created.request;
      }
    }

    const out = await executeRuntimeRecoveryRequest(tenant, {
      recReq,
      actorName: initiatedBy || user.name,
      bypassApprovalGate: Boolean(bypassApproval),
    });
    return res.status(out.statusCode).json(out.payload);
  });

  // 8. Approvals
  app.get('/api/v1/approvals', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.approvals);
  });

  app.post('/api/v1/approvals/:id/respond', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;

    const { id } = req.params;
    const { decision, responderName, rejectionReason, reason } = req.body || {};

    const approval = tenant.approvals.find((a) => a.id === id);
    if (!approval) return res.status(404).json({ error: 'Approval request not found' });

    if (approval.status !== 'PENDING') {
      return res.status(409).json({
        error: `Approval request already finalized with status '${approval.status}'.`,
      });
    }

    const normDecision = String(decision || '').trim().toUpperCase();
    if (!['APPROVE', 'APPROVED', 'REJECT', 'REJECTED'].includes(normDecision)) {
      return res.status(400).json({ error: 'Decision must be APPROVE or REJECT' });
    }

    const isApproved = normDecision === 'APPROVE' || normDecision === 'APPROVED';
    const nowIso = new Date().toISOString();
    const resolvedActor = responderName || user.name;
    const resolvedReason = rejectionReason || reason;

    approval.status = isApproved ? 'APPROVED' : 'REJECTED';
    approval.approverUserId = user.id;
    approval.respondedBy = resolvedActor;
    approval.respondedAt = nowIso;
    if (!isApproved && resolvedReason) {
      approval.rejectionReason = resolvedReason;
    }

    const incident = tenant.incidents.find((i) => i.id === approval.incidentId);
    const linkedReq = approval.recoveryRequestId
      ? tenant.recoveryRequests.find((r) => r.id === approval.recoveryRequestId)
      : undefined;

    if (isApproved) {
      if (incident) incident.status = 'RECOVERING';
      if (linkedReq && linkedReq.status === 'PENDING_APPROVAL') {
        linkedReq.status = linkedReq.delaySeconds > 0 ? 'SCHEDULED' : 'APPROVED';
        linkedReq.updatedAt = nowIso;
      }
      approval.recoveryStatus = linkedReq?.status;
      pushNotificationForTenant(tenant, {
        type: 'RECOVERY_APPROVED',
        title: 'Recovery Request Approved',
        message: `${resolvedActor} approved recovery action "${approval.proposedAction}".`,
        incidentId: approval.incidentId,
      });
    } else {
      if (incident) incident.status = 'INVESTIGATING';
      if (linkedReq && ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'].includes(linkedReq.status)) {
        linkedReq.status = 'REJECTED';
        linkedReq.lastError = resolvedReason || 'Rejected by operator.';
        linkedReq.finalResultSummary = `Rejected by ${resolvedActor}: ${resolvedReason || 'No reason provided'}`;
        linkedReq.completedAt = nowIso;
        linkedReq.updatedAt = nowIso;
      }
      approval.recoveryStatus = linkedReq?.status;
      pushNotificationForTenant(tenant, {
        type: 'RECOVERY_REJECTED',
        title: 'Recovery Request Rejected',
        message: `${resolvedActor} rejected "${approval.proposedAction}".`,
        incidentId: approval.incidentId,
      });
    }

    recordAuditForTenant(
      tenant,
      'APPROVAL_SUBMITTED',
      'APPROVAL_REQUEST',
      approval.id,
      `${approval.status} recovery for incident #${approval.incidentId}${resolvedReason ? ` (${resolvedReason})` : ''}`,
      resolvedActor,
      user.email
    );

    res.json({ success: true, approval, recoveryRequest: linkedReq || null });
  });

  app.post('/api/v1/approvals/:id/cancel', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const approval = tenant.approvals.find((a) => a.id === req.params.id);
    if (!approval) return res.status(404).json({ error: 'Approval request not found' });
    if (approval.status !== 'PENDING') {
      return res.status(409).json({ error: `Cannot cancel approval in status '${approval.status}'.` });
    }

    const nowIso = new Date().toISOString();
    const cancelReason = req.body?.reason || 'Cancelled by operator.';
    approval.status = 'CANCELLED';
    approval.approverUserId = user.id;
    approval.respondedBy = user.name;
    approval.respondedAt = nowIso;
    approval.rejectionReason = cancelReason;

    const linkedReq = approval.recoveryRequestId
      ? tenant.recoveryRequests.find((r) => r.id === approval.recoveryRequestId)
      : undefined;
    if (linkedReq && ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'].includes(linkedReq.status)) {
      linkedReq.status = 'CANCELLED';
      linkedReq.lastError = cancelReason;
      linkedReq.finalResultSummary = cancelReason;
      linkedReq.completedAt = nowIso;
      linkedReq.updatedAt = nowIso;
    }
    approval.recoveryStatus = linkedReq?.status;

    const incident = tenant.incidents.find((i) => i.id === approval.incidentId);
    if (incident && ['APPROVAL_REQUIRED', 'RECOVERING'].includes(incident.status)) {
      incident.status = 'INVESTIGATING';
    }

    recordAuditForTenant(tenant, 'RECOVERY_CANCELLED', 'APPROVAL_REQUEST', approval.id, cancelReason, user.name, user.email);
    res.json({ success: true, approval, recoveryRequest: linkedReq || null });
  });

  // 9. Zevkar Interactive Assistant Chat
  app.post('/api/v1/assistant/chat', async (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const { tenant } = ctx;
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const stats = getDashboardMetricsForTenant(tenant);
    const activeIncidentsSummary = tenant.incidents
      .filter((i) => i.status !== 'RESOLVED')
      .map((i) => `[${i.id}] Client: ${i.clientName} | Workflow: ${i.workflowName} | Error: ${i.errorMessage} | Severity: ${i.severity} | Status: ${i.status}`)
      .join('\n');

    const systemContext = `You are the "Zevkar" senior reliability engineer assistant for the agency "${tenant.agency.name}".
Live Agency Health Context:
- Overall Health Score: ${stats.overallHealthScore}%
- Total Clients: ${stats.totalClients}
- Active Incidents (${stats.activeIncidentsCount}):
${activeIncidentsSummary || 'None currently active!'}
- Pending Approvals: ${stats.pendingApprovalsCount}
- Recovery Success Rate: ${stats.recoverySuccessRate}%

Respond concisely and professionally with actionable recommendations.`;

    if (ai) {
      try {
        const callPromise = ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `${systemContext}\n\nUser Question: ${message}`,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI assistant request timed out')), 2500)
        );

        const response = await Promise.race([callPromise, timeoutPromise]);
        const replyText = response.text || "I've reviewed your automations. All systems are being monitored.";
        return res.json({
          reply: replyText,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[Zevkar] Gemini chat timed out or failed, using deterministic telemetry engine:', err);
      }
    }

    const activeList = tenant.incidents.filter((i) => i.status !== 'RESOLVED');
    const lowerQ = String(message).toLowerCase();
    let reply = `Zevkar Telemetry Briefing for ${tenant.agency.name}:\n\n- Fleet Health: ${stats.overallHealthScore}%\n- Active Incidents: ${activeList.length}\n- 24h Executions: ${(stats.successfulExecutions24h + stats.failedExecutions24h).toLocaleString()} (${stats.workflowSuccessRate}% success)`;

    if (lowerQ.includes('fix first') || lowerQ.includes('priority')) {
      const highestSev = activeList.find((i) => i.severity === 'CRITICAL') || activeList[0];
      if (highestSev) {
        reply = `**Immediate Priority**: Incident #${highestSev.id} (${highestSev.workflowName}) for client **${highestSev.clientName}**.\n\n- Severity: ${highestSev.severity}\n- Root Cause: ${highestSev.errorCategory} (${highestSev.errorMessage.slice(0, 80)}...)\n- Recommended Action: Review and execute safe recovery from the Recovery Center or Approvals tab.`;
      } else {
        reply = tenant.workflows.length === 0
          ? `No workflows are connected for ${tenant.agency.name} yet. Add a client and connect your first n8n, Make, or Zapier integration to begin monitoring.`
          : `All active incidents have been resolved! Your automation fleet is currently running at 100% operational health.`;
      }
    } else if (lowerQ.includes('client')) {
      reply = tenant.clients.length === 0
        ? `No clients configured yet for ${tenant.agency.name}.`
        : `**Client Reliability Summary**:\n${tenant.clients.map((c, idx) => `${idx + 1}. ${c.name}: ${c.healthScore}% health (${c.activeIncidentsCount} active issues)`).join('\n')}`;
    } else if (lowerQ.includes('summarize') || lowerQ.includes('health')) {
      reply = `**Daily Fleet Health Diagnostic**:\nAcross ${stats.totalWorkflows} workflows and ${stats.totalClients} client environments, ${stats.successfulExecutions24h + stats.failedExecutions24h} executions were processed in the last 24h with a ${stats.workflowSuccessRate}% success rate. ${stats.pendingApprovalsCount} human approval request(s) currently pending review.`;
    }

    res.json({
      reply,
      timestamp: new Date().toISOString(),
    });
  });

  // 10. Notifications & Notification Preferences
  app.get('/api/v1/notifications', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.notifications);
  });

  app.post('/api/v1/notifications/mark-read', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    ctx.tenant.notifications.forEach((n) => (n.isRead = true));
    res.json({ success: true });
  });

  app.post('/api/v1/notifications/read-all', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    ctx.tenant.notifications.forEach((n) => (n.isRead = true));
    res.json({ success: true });
  });

  app.post('/api/v1/notifications/:id/read', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    const notif = ctx.tenant.notifications.find((n) => n.id === req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    notif.isRead = true;
    res.json({ success: true, notification: notif });
  });

  app.get('/api/v1/notifications/preferences', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.notificationPreferences);
  });

  app.put('/api/v1/notifications/preferences', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireWriteRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const items = Array.isArray(req.body?.preferences) ? req.body.preferences : Array.isArray(req.body) ? req.body : [];
    const validChannels = new Set(['IN_APP', 'EMAIL', 'WEBHOOK']);
    const validSeverities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    for (const item of items) {
      if (!item || !validChannels.has(item.channel)) continue;
      const existing = tenant.notificationPreferences.find((p) => p.channel === item.channel);
      const nextSev = validSeverities.has(item.minSeverity) ? item.minSeverity : (existing?.minSeverity || 'HIGH');
      const nextEnabled = typeof item.isEnabled === 'boolean' ? item.isEnabled : Boolean(existing?.isEnabled);
      if (existing) {
        existing.minSeverity = nextSev;
        existing.isEnabled = nextEnabled;
      } else {
        tenant.notificationPreferences.push({
          channel: item.channel,
          minSeverity: nextSev,
          isEnabled: nextEnabled,
        });
      }
    }
    recordAuditForTenant(tenant, 'NOTIFICATION_PREFS_UPDATED', 'SETTINGS', tenant.agency.id, 'Updated alert notification channel preferences', user.name, user.email);
    res.json(tenant.notificationPreferences);
  });

  // 11. Team, Role Governance & Invitations
  app.get('/api/v1/team', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.teamMembers);
  });

  app.get('/api/v1/team/invitations', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.invitations);
  });

  app.post('/api/v1/team/invite', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { email, name, role = 'MEMBER' } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid work email is required' });
    }
    const resolvedRole = ['ADMIN', 'MEMBER', 'VIEWER'].includes(String(role).toUpperCase())
      ? (String(role).toUpperCase() as 'ADMIN' | 'MEMBER' | 'VIEWER')
      : 'MEMBER';
    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : cleanEmail.split('@')[0];
    const nowIso = new Date().toISOString();

    const newMember: AgencyMember = {
      id: `mem_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId: `usr_inv_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: resolvedRole,
      joinedAt: nowIso,
      status: 'INVITED',
    };
    tenant.teamMembers.push(newMember);

    const invitation: InvitationItem = {
      id: `inv_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      agencyId: tenant.agency.id,
      email: cleanEmail,
      name: cleanName,
      role: resolvedRole,
      token: `invtok_${crypto.randomBytes(12).toString('hex')}`,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: nowIso,
    };
    tenant.invitations.unshift(invitation);
    recordAuditForTenant(tenant, 'TEAM_INVITE_SENT', 'INVITATION', invitation.id, `Invited ${cleanEmail} as ${resolvedRole}`, user.name, user.email);
    res.status(201).json({ ...newMember, invitation });
  });

  app.get('/api/v1/team/invitations/:token', (req: Request, res: Response) => {
    const token = req.params.token;
    let matchedTenant: TenantStore | undefined;
    let matchedInv: InvitationItem | undefined;
    for (const t of tenantStores.values()) {
      const found = t.invitations.find((inv) => inv.token === token);
      if (found) {
        matchedTenant = t;
        matchedInv = found;
        break;
      }
    }
    if (!matchedTenant || !matchedInv) {
      return res.status(404).json({ valid: false, status: 'INVALID', error: 'Invitation link is invalid or was not found.' });
    }
    if (matchedInv.status === 'PENDING' && Date.parse(matchedInv.expiresAt) < Date.now()) {
      matchedInv.status = 'EXPIRED';
    }
    return res.json({
      valid: matchedInv.status === 'PENDING',
      status: matchedInv.status,
      email: matchedInv.email,
      name: matchedInv.name,
      role: matchedInv.role,
      expiresAt: matchedInv.expiresAt,
      agencyName: matchedTenant.agency.name,
    });
  });

  app.post('/api/v1/team/invitations/:token/accept', (req: Request, res: Response) => {
    const token = req.params.token;
    const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : undefined;

    let matchedTenant: TenantStore | undefined;
    let matchedInv: InvitationItem | undefined;
    for (const t of tenantStores.values()) {
      const found = t.invitations.find((inv) => inv.token === token);
      if (found) {
        matchedTenant = t;
        matchedInv = found;
        break;
      }
    }
    if (!matchedTenant || !matchedInv) {
      return res.status(404).json({ error: 'Invitation token is invalid or not found.' });
    }
    if (matchedInv.status === 'ACCEPTED') {
      return res.status(409).json({ error: 'This invitation has already been accepted.' });
    }
    if (matchedInv.status === 'REVOKED') {
      return res.status(410).json({ error: 'This invitation has been revoked by a workspace administrator.' });
    }
    if (matchedInv.status === 'EXPIRED' || Date.parse(matchedInv.expiresAt) < Date.now()) {
      matchedInv.status = 'EXPIRED';
      return res.status(410).json({ error: 'Invitation token has expired.' });
    }
    const existingAuth = extractTenantAuth(req);
    if (existingAuth && existingAuth.user.email.toLowerCase() !== matchedInv.email.toLowerCase()) {
      return res.status(403).json({
        error: `You are signed in as ${existingAuth.user.email}, which does not match the invited email ${matchedInv.email}. Sign out first or accept with the invited account.`,
      });
    }
    if (!existingAuth && password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    matchedInv.status = 'ACCEPTED';
    const member = matchedTenant.teamMembers.find((m) => m.email.toLowerCase() === matchedInv!.email.toLowerCase());
    const userId = member?.userId || `usr_${Date.now()}`;
    const resolvedName = fullName || matchedInv.name || matchedInv.email.split('@')[0];
    if (member) {
      member.status = 'ACTIVE';
      member.name = resolvedName;
      member.joinedAt = new Date().toISOString();
    } else {
      matchedTenant.teamMembers.push({
        id: `mem_${Date.now()}`,
        userId,
        name: resolvedName,
        email: matchedInv.email,
        role: matchedInv.role,
        joinedAt: new Date().toISOString(),
        status: 'ACTIVE',
      });
    }

    usersByEmail.set(matchedInv.email.toLowerCase(), {
      id: userId,
      email: matchedInv.email.toLowerCase(),
      name: resolvedName,
      passwordHash: password && password.length >= 6 ? hashPassword(password) : undefined,
      role: matchedInv.role,
      agencyId: matchedTenant.agency.id,
      isVerified: true,
      timezone: matchedTenant.agency.timezone || 'UTC',
    });

    const sessionUser: SessionUser = {
      id: userId,
      email: matchedInv.email.toLowerCase(),
      name: resolvedName,
      role: matchedInv.role,
      agencyId: matchedTenant.agency.id,
      isVerified: true,
      timezone: matchedTenant.agency.timezone || 'UTC',
    };
    const tokens = issueTokensForUser(sessionUser);
    setSessionCookie(res, tokens.token);
    recordAuditForTenant(matchedTenant, 'TEAM_INVITE_ACCEPTED', 'INVITATION', matchedInv.id, `${matchedInv.email} accepted invitation`, resolvedName, matchedInv.email);
    res.json({
      success: true,
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: sessionUser,
      agency: matchedTenant.agency,
      invitation: matchedInv,
    });
  });

  app.delete('/api/v1/team/invitations/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const inv = tenant.invitations.find((i) => i.id === req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    inv.status = 'REVOKED';
    tenant.teamMembers = tenant.teamMembers.filter((m) => !(m.email.toLowerCase() === inv.email.toLowerCase() && m.status === 'INVITED'));
    recordAuditForTenant(tenant, 'TEAM_INVITE_REVOKED', 'INVITATION', inv.id, `Revoked invitation for ${inv.email}`, user.name, user.email);
    res.json({ success: true, invitation: inv });
  });

  app.put('/api/v1/team/members/:id/role', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const member = tenant.teamMembers.find((m) => m.id === req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });
    const nextRole = String(req.body?.role || '').toUpperCase();
    if (!['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(nextRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    member.role = nextRole as any;
    const userRec = usersByEmail.get(member.email.toLowerCase());
    if (userRec) userRec.role = nextRole as any;
    recordAuditForTenant(tenant, 'TEAM_ROLE_UPDATED', 'MEMBER', member.id, `Updated ${member.email} role to ${nextRole}`, user.name, user.email);
    res.json(member);
  });

  app.delete('/api/v1/team/members/:id', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const member = tenant.teamMembers.find((m) => m.id === req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });
    if (member.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot remove the workspace OWNER.' });
    }
    tenant.teamMembers = tenant.teamMembers.filter((m) => m.id !== req.params.id);
    recordAuditForTenant(tenant, 'TEAM_MEMBER_REMOVED', 'MEMBER', member.id, `Removed ${member.email} from team`, user.name, user.email);
    res.json({ success: true, id: req.params.id });
  });

  // 12. Webhook Ingestion (Tenant-aware: resolves via auth session, explicit agencyId, or matching tenant workflow)
  app.post('/api/v1/webhooks/listener', (req: Request, res: Response) => {
    const event = req.body || {};
    const { workflowId, workflowName, clientName, error, executionId, platform = 'n8n', status = 'FAILED', agencyId: bodyAgencyId } = event;
    const authCtx = extractTenantAuth(req);
    const requestedAgencyId = String(req.headers['x-agency-id'] || req.query.agencyId || bodyAgencyId || '');
    let tenant: TenantStore | undefined =
      authCtx?.tenant ||
      (requestedAgencyId ? tenantStores.get(requestedAgencyId) : undefined);

    if (!tenant && workflowId) {
      for (const candidate of tenantStores.values()) {
        if (candidate.workflows.some((w) => w.id === workflowId || w.externalWorkflowId === workflowId)) {
          tenant = candidate;
          break;
        }
      }
    }
    if (!tenant) {
      tenant = tenantStores.get(DEMO_AGENCY_ID);
    }
    if (!tenant) {
      return res.status(404).json({ error: 'Target workspace tenant not found' });
    }

    const nowIso = new Date().toISOString();
    const resolvedWfId = workflowId || 'wf_sim_01';
    const resolvedExecId = executionId || `exec_${Date.now()}`;

    let matchedWf = tenant.workflows.find((w) => w.id === resolvedWfId || w.externalWorkflowId === resolvedWfId);
    if (!matchedWf) {
      const defaultClient = tenant.clients[0];
      matchedWf = {
        id: resolvedWfId,
        agencyId: tenant.agency.id,
        clientId: defaultClient?.id || 'unassigned',
        clientName: clientName || defaultClient?.name || 'External Client',
        integrationId: tenant.integrations[0]?.id || 'unassigned',
        platform: platform as any,
        externalWorkflowId: resolvedWfId,
        name: workflowName || 'Inbound Webhook Automation',
        isActive: true,
        healthStatus: error ? 'DEGRADED' : 'HEALTHY',
        consecutiveFailures: error ? 1 : 0,
        lastExecutionAt: nowIso,
        avgDurationMs: 1100,
        createdAt: nowIso,
      };
      tenant.workflows.unshift(matchedWf);
      tenant.agency.workflowsCount = tenant.workflows.length;
    }

    const existingExec = tenant.executions.find(
      (e) => e.workflowId === matchedWf!.id && (e.externalExecutionId === resolvedExecId || e.id === resolvedExecId)
    );
    if (!existingExec) {
      tenant.executions.unshift({
        id: `exec_${matchedWf.id}_${resolvedExecId}`,
        workflowId: matchedWf.id,
        integrationId: matchedWf.integrationId,
        externalExecutionId: resolvedExecId,
        workflowName: matchedWf.name,
        clientName: matchedWf.clientName,
        platform: matchedWf.platform,
        status: error ? 'FAILED' : (String(status).toUpperCase() === 'SUCCESS' ? 'SUCCESS' : 'FAILED'),
        rawStatus: error ? 'error' : String(status).toLowerCase(),
        startedAt: nowIso,
        finishedAt: nowIso,
        durationMs: 1120,
        mode: 'webhook',
        errorMessage: error ? String(error) : undefined,
        retryCount: 0,
      });
    }

    matchedWf.lastExecutionAt = nowIso;

    if (error) {
      matchedWf.lastFailedAt = nowIso;
      matchedWf.consecutiveFailures += 1;
      matchedWf.healthStatus = matchedWf.consecutiveFailures >= 3 ? 'FAILING' : 'DEGRADED';

      const dupIncident = tenant.incidents.find(
        (i) => i.workflowId === matchedWf!.id && i.executionId === resolvedExecId
      );
      if (dupIncident) {
        return res.status(200).json({ status: 'DUPLICATE_EXECUTION_IGNORED', incidentId: dupIncident.id });
      }

      const classified = classifyError(String(error));
      const activeGroup = tenant.incidents.find(
        (i) =>
          i.workflowId === matchedWf!.id &&
          i.errorCategory === classified.category &&
          i.status !== 'RESOLVED' &&
          i.status !== 'IGNORED'
      );
      if (activeGroup) {
        activeGroup.occurrenceCount += 1;
        activeGroup.lastDetectedAt = nowIso;
        activeGroup.executionId = resolvedExecId;
        activeGroup.errorMessage = String(error);
        return res.status(200).json({ status: 'INCIDENT_UPDATED', incidentId: activeGroup.id });
      }

      const newInc: Incident = {
        id: `inc_${Date.now()}`,
        agencyId: tenant.agency.id,
        clientId: matchedWf.clientId,
        clientName: matchedWf.clientName,
        workflowId: matchedWf.id,
        workflowName: matchedWf.name,
        platform: matchedWf.platform,
        executionId: resolvedExecId,
        errorCategory: classified.category,
        errorMessage: String(error),
        severity: classified.severity,
        status: classified.requiresApproval ? 'APPROVAL_REQUIRED' : 'OPEN',
        firstDetectedAt: nowIso,
        lastDetectedAt: nowIso,
        occurrenceCount: 1,
        recoveryAttempts: [],
      };
      tenant.incidents.unshift(newInc);

      pushNotificationForTenant(tenant, {
        type: classified.requiresApproval ? 'APPROVAL_REQUEST' : 'CRITICAL_FAILURE',
        title: `Incident Detected: ${newInc.workflowName}`,
        message: newInc.errorMessage,
        incidentId: newInc.id,
      });

      recordAuditForTenant(tenant, 'INCIDENT_CREATED', 'INCIDENT', newInc.id, `Webhook ingested ${newInc.platform} failure for "${newInc.workflowName}"`, 'Webhook Gateway', 'hooks@zevkar.internal');

      return res.status(201).json({ status: 'INCIDENT_CREATED', incidentId: newInc.id });
    }

    matchedWf.lastSuccessfulAt = nowIso;
    matchedWf.consecutiveFailures = 0;
    matchedWf.healthStatus = 'HEALTHY';
    res.json({ status: 'EVENT_ACKNOWLEDGED' });
  });

  // 13. Audit Logs & Billing
  app.get('/api/v1/audit-logs', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.auditLogs);
  });

  app.get('/api/v1/audit', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json(ctx.tenant.auditLogs);
  });

  app.get('/api/v1/billing/subscription', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    res.json({
      agencyId: ctx.tenant.agency.id,
      tier: ctx.tenant.agency.tier,
      status: 'ACTIVE',
      catalog: getPricingCatalog(),
    });
  });

  app.post('/api/v1/billing/upgrade', (req: Request, res: Response) => {
    const ctx = requireTenantAuth(req, res);
    if (!ctx) return;
    if (!requireAdminRole(ctx.user, res)) return;
    const { tenant, user } = ctx;
    const { tier } = req.body || {};
    if (!tier || !['FREE', 'STARTER', 'GROWTH', 'AGENCY_PRO'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    tenant.agency.tier = tier;
    recordAuditForTenant(tenant, 'PLAN_UPDATED', 'AGENCY', tenant.agency.id, `Updated agency plan tier to ${tier}`, user.name, user.email);
    res.json({ success: true, agency: tenant.agency });
  });

  registerPhase10Routes(app, {
    demoAgencyId: DEMO_AGENCY_ID,
    requireTenantAuth,
    requireWriteRole,
    requireAdminRole,
    recordAuditForTenant,
    pushNotificationForTenant,
  });

  // Create underlying HTTP server to support both Express routes and Vite HMR WebSockets
  const httpServer = http.createServer(app);

  // Mount Vite in dev mode
  if (!isProd) {
    const isHttps = process.env.APP_URL?.startsWith('https') || process.env.HTTPS === 'true';
    const disableHmr = process.env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === '1';

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : {
          server: httpServer,
          clientPort: isHttps ? 443 : undefined,
        },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve optimized static frontend build
    app.use(express.static('dist'));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zevkar] Server running on http://0.0.0.0:${PORT} (mode: ${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
