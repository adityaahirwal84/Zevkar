import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type {
  Agency,
  AlertChannel,
  AlertChannelType,
  AlertDeliveryLog,
  Execution,
  Incident,
  NotificationItem,
  RecoveryRequest,
  ReliabilityRule,
  ReliabilityRuleAction,
  ReliabilityRuleCondition,
  Severity,
  SlaPolicy,
  Workflow,
} from '../types';
import {
  buildAlertWebhookPayload,
  computeSlaCompliance,
  createDefaultSlaPolicy,
  evaluateReliabilityRules,
  isRestrictedNetworkTarget,
  maskWebhookTarget,
  severityMeetsMinimum,
  validateAlertChannelInput,
} from '../lib/reliability-rules';

export interface Phase10TenantLike {
  agency: Agency;
  workflows: Workflow[];
  executions: Execution[];
  incidents: Incident[];
  recoveryRequests: RecoveryRequest[];
}

export interface Phase10UserLike {
  id: string;
  email: string;
  name: string;
  role: string;
  agencyId: string;
}

interface Phase10Store {
  slaPolicy: SlaPolicy;
  channels: AlertChannel[];
  channelSecrets: Map<string, { targetUrl: string; signingSecret: string }>;
  rules: ReliabilityRule[];
  deliveries: AlertDeliveryLog[];
}

export interface Phase10RouteDeps<TTenant extends Phase10TenantLike, TUser extends Phase10UserLike> {
  demoAgencyId: string;
  requireTenantAuth: (req: Request, res: Response) => { user: TUser; tenant: TTenant } | null;
  requireWriteRole: (user: TUser, res: Response) => boolean;
  requireAdminRole: (user: TUser, res: Response) => boolean;
  recordAuditForTenant: (
    tenant: TTenant,
    action: string,
    entityType: string,
    entityId: string,
    details: string,
    actorName?: string,
    actorEmail?: string
  ) => void;
  pushNotificationForTenant: (
    tenant: TTenant,
    params: {
      type: NotificationItem['type'];
      title: string;
      message: string;
      incidentId?: string;
    }
  ) => unknown;
}

const VALID_CHANNEL_TYPES: AlertChannelType[] = [
  'SLACK',
  'DISCORD',
  'CUSTOM_WEBHOOK',
  'PAGERDUTY',
  'EMAIL_DIGEST',
];

const VALID_CONDITIONS: ReliabilityRuleCondition[] = [
  'CONSECUTIVE_FAILURES',
  'FAILURE_RATE_SPIKE',
  'CRITICAL_INCIDENT_OPEN',
  'SLA_BREACH',
];

const VALID_ACTIONS: ReliabilityRuleAction[] = [
  'NOTIFY_CHANNELS',
  'OPEN_RECOVERY_REQUEST',
  'ESCALATE_SEVERITY',
];

const VALID_SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function registerPhase10Routes<
  TTenant extends Phase10TenantLike,
  TUser extends Phase10UserLike,
>(app: Express, deps: Phase10RouteDeps<TTenant, TUser>): void {
  const storeByTenant = new Map<string, Phase10Store>();

  function getOrCreateStore(tenantId: string): Phase10Store {
    const existing = storeByTenant.get(tenantId);
    if (existing) return existing;

    const nowIso = new Date().toISOString();
    const isDemo = tenantId === deps.demoAgencyId;

    if (!isDemo) {
      const cleanStore: Phase10Store = {
        slaPolicy: createDefaultSlaPolicy(tenantId),
        channels: [],
        channelSecrets: new Map(),
        rules: [],
        deliveries: [],
      };
      storeByTenant.set(tenantId, cleanStore);
      return cleanStore;
    }

    const ch1Secret = crypto.randomBytes(16).toString('hex');
    const ch2Secret = crypto.randomBytes(16).toString('hex');

    const demoStore: Phase10Store = {
      slaPolicy: {
        agencyId: tenantId,
        targetSuccessRatePercent: 99.0,
        targetMttrMinutes: 15,
        maxOpenCriticalIncidents: 1,
        evaluationWindowHours: 24,
        updatedAt: nowIso,
      },
      channels: [
        {
          id: 'ch_demo_slack',
          agencyId: tenantId,
          name: 'Ops War-Room Slack',
          channelType: 'SLACK',
          targetPreview: 'https://hooks.slack.com/••••9X2K',
          hasTargetUrl: true,
          minSeverity: 'HIGH',
          isEnabled: true,
          signingSecretPreview: `whsec_••••${ch1Secret.slice(-4)}`,
          lastTestedAt: nowIso,
          lastDeliveryStatus: 'SIMULATED_LOCAL',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: 'ch_demo_webhook',
          agencyId: tenantId,
          name: 'Incident Pager Bridge Webhook',
          channelType: 'CUSTOM_WEBHOOK',
          targetPreview: 'https://alerts.apexautomations.example.com/••••8812',
          hasTargetUrl: true,
          minSeverity: 'CRITICAL',
          isEnabled: true,
          signingSecretPreview: `whsec_••••${ch2Secret.slice(-4)}`,
          lastTestedAt: nowIso,
          lastDeliveryStatus: 'SIMULATED_LOCAL',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      channelSecrets: new Map([
        [
          'ch_demo_slack',
          {
            targetUrl: 'https://hooks.slack.com/services/T000DEMO/B000DEMO/DEMO9X2K',
            signingSecret: ch1Secret,
          },
        ],
        [
          'ch_demo_webhook',
          {
            targetUrl: 'https://alerts.apexautomations.example.com/webhook/8812',
            signingSecret: ch2Secret,
          },
        ],
      ]),
      rules: [
        {
          id: 'rule_demo_consec',
          agencyId: tenantId,
          name: 'Consecutive Failure Circuit Alert',
          conditionType: 'CONSECUTIVE_FAILURES',
          thresholdValue: 3,
          severity: 'HIGH',
          actionType: 'NOTIFY_CHANNELS',
          targetChannelIds: ['ch_demo_slack'],
          cooldownMinutes: 15,
          isEnabled: true,
          triggerCount: 1,
          lastTriggeredAt: new Date(Date.now() - 45 * 60_000).toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        {
          id: 'rule_demo_sla',
          agencyId: tenantId,
          name: 'Workspace SLA Breach Escalation',
          conditionType: 'SLA_BREACH',
          thresholdValue: 99,
          severity: 'CRITICAL',
          actionType: 'ESCALATE_SEVERITY',
          targetChannelIds: ['ch_demo_slack', 'ch_demo_webhook'],
          cooldownMinutes: 30,
          isEnabled: true,
          triggerCount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      deliveries: [
        {
          id: 'deliv_demo_1',
          agencyId: tenantId,
          channelId: 'ch_demo_slack',
          channelName: 'Ops War-Room Slack',
          channelType: 'SLACK',
          ruleId: 'rule_demo_consec',
          ruleName: 'Consecutive Failure Circuit Alert',
          eventType: 'RULE_TRIGGERED',
          severity: 'HIGH',
          title: 'Guardrail "Consecutive Failure Circuit Alert" triggered',
          message: 'Workflow execution crossed 3 consecutive failures.',
          status: 'SIMULATED_LOCAL',
          httpStatus: 202,
          signatureHeader: 'sha256=demo_signed_payload',
          responseSummary: 'Sandbox verification queued cleanly.',
          deliveredAt: new Date(Date.now() - 45 * 60_000).toISOString(),
        },
      ],
    };
    storeByTenant.set(tenantId, demoStore);
    return demoStore;
  }

  async function dispatchAlertToChannel(
    tenant: TTenant,
    store: Phase10Store,
    channel: AlertChannel,
    event: {
      eventType: 'TEST_ALERT' | 'RULE_TRIGGERED' | 'SLA_BREACH';
      severity: Severity;
      title: string;
      message: string;
      ruleId?: string;
      ruleName?: string;
      matchedWorkflowIds?: string[];
      matchedIncidentIds?: string[];
    }
  ): Promise<AlertDeliveryLog> {
    const secretRec = store.channelSecrets.get(channel.id);
    const targetUrl = secretRec?.targetUrl || '';
    const signingSecret = secretRec?.signingSecret || 'zevkar_ephemeral';
    const payload = buildAlertWebhookPayload({
      agencyId: tenant.agency.id,
      agencyName: tenant.agency.name,
      eventType: event.eventType,
      severity: event.severity,
      title: event.title,
      message: event.message,
      ruleId: event.ruleId,
      matchedWorkflowIds: event.matchedWorkflowIds,
      matchedIncidentIds: event.matchedIncidentIds,
    });
    const bodyString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', signingSecret).update(bodyString).digest('hex');
    const signatureHeader = `sha256=${hmac}`;
    const nowIso = new Date().toISOString();

    let status: AlertDeliveryLog['status'] = 'SIMULATED_LOCAL';
    let httpStatus: number | undefined = 202;
    let responseSummary = 'Delivered via local verification sandbox.';

    if (channel.channelType === 'EMAIL_DIGEST') {
      status = 'SIMULATED_LOCAL';
      httpStatus = 202;
      responseSummary = `Alert queued for email digest (${channel.targetPreview}).`;
    } else if (!targetUrl || isRestrictedNetworkTarget(targetUrl) || targetUrl.includes('DEMO')) {
      status = 'SIMULATED_LOCAL';
      httpStatus = 202;
      responseSummary = 'Signed webhook payload verified in sandbox mode (no restricted network call).';
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const outgoingBody =
          channel.channelType === 'SLACK'
            ? JSON.stringify({
                text: `[${event.severity}] ${event.title}\n${event.message} (${tenant.agency.name})`,
                zevkar: payload,
              })
            : channel.channelType === 'DISCORD'
            ? JSON.stringify({
                content: `**[${event.severity}] ${event.title}**\n${event.message}`,
              })
            : bodyString;

        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Zevkar-Signature': signatureHeader,
            'X-Zevkar-Event': event.eventType,
            'User-Agent': 'Zevkar-Alert-Dispatcher/1.0',
          },
          body: outgoingBody,
          signal: controller.signal,
        });
        httpStatus = resp.status;
        if (resp.ok) {
          status = 'DELIVERED';
          responseSummary = `HTTP ${resp.status} accepted by remote endpoint.`;
        } else {
          status = 'FAILED';
          responseSummary = `Remote endpoint returned HTTP ${resp.status}.`;
        }
      } catch (err: any) {
        status = 'FAILED';
        httpStatus = 502;
        responseSummary = err?.name === 'AbortError'
          ? 'Webhook delivery timed out after 5000ms.'
          : err?.message || 'Network request failed during webhook dispatch.';
      } finally {
        clearTimeout(timeout);
      }
    }

    channel.lastTestedAt = nowIso;
    channel.lastDeliveryStatus = status;
    channel.lastError = status === 'FAILED' ? responseSummary : undefined;
    channel.updatedAt = nowIso;

    const logItem: AlertDeliveryLog = {
      id: `deliv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      agencyId: tenant.agency.id,
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.channelType,
      ruleId: event.ruleId,
      ruleName: event.ruleName,
      eventType: event.eventType,
      severity: event.severity,
      title: event.title,
      message: event.message,
      status,
      httpStatus,
      signatureHeader: `${signatureHeader.slice(0, 22)}...`,
      responseSummary,
      deliveredAt: nowIso,
    };
    store.deliveries.unshift(logItem);
    if (store.deliveries.length > 100) {
      store.deliveries.length = 100;
    }
    return logItem;
  }

  // SLA Policy & Live Compliance Report
  app.get('/api/v1/sla/policy', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    const store = getOrCreateStore(ctx.tenant.agency.id);
    res.json(store.slaPolicy);
  });

  app.put('/api/v1/sla/policy', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireAdminRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const body = req.body || {};

    const nextTargetSuccess =
      typeof body.targetSuccessRatePercent === 'number'
        ? Math.max(50, Math.min(100, Number(body.targetSuccessRatePercent)))
        : store.slaPolicy.targetSuccessRatePercent;
    const nextMttr =
      typeof body.targetMttrMinutes === 'number'
        ? Math.max(1, Math.min(1440, Number(body.targetMttrMinutes)))
        : store.slaPolicy.targetMttrMinutes;
    const nextMaxCrit =
      typeof body.maxOpenCriticalIncidents === 'number'
        ? Math.max(0, Math.min(100, Math.floor(body.maxOpenCriticalIncidents)))
        : store.slaPolicy.maxOpenCriticalIncidents;
    const nextWindow =
      typeof body.evaluationWindowHours === 'number'
        ? Math.max(1, Math.min(720, Math.floor(body.evaluationWindowHours)))
        : store.slaPolicy.evaluationWindowHours;

    store.slaPolicy = {
      agencyId: ctx.tenant.agency.id,
      targetSuccessRatePercent: Math.round(nextTargetSuccess * 10) / 10,
      targetMttrMinutes: nextMttr,
      maxOpenCriticalIncidents: nextMaxCrit,
      evaluationWindowHours: nextWindow,
      updatedAt: new Date().toISOString(),
    };

    deps.recordAuditForTenant(
      ctx.tenant,
      'SLA_POLICY_UPDATED',
      'SLA_POLICY',
      ctx.tenant.agency.id,
      `Updated SLA target (${store.slaPolicy.targetSuccessRatePercent}% success, ${store.slaPolicy.targetMttrMinutes}m MTTR)`,
      ctx.user.name,
      ctx.user.email
    );
    res.json(store.slaPolicy);
  });

  app.get('/api/v1/sla/report', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    const store = getOrCreateStore(ctx.tenant.agency.id);
    const report = computeSlaCompliance(store.slaPolicy, {
      workflows: ctx.tenant.workflows,
      executions: ctx.tenant.executions,
      incidents: ctx.tenant.incidents,
      recoveryRequests: ctx.tenant.recoveryRequests,
    });
    res.json(report);
  });

  // Alert Channels CRUD & Live Test Dispatch
  app.get('/api/v1/alerts/channels', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    const store = getOrCreateStore(ctx.tenant.agency.id);
    res.json(store.channels);
  });

  app.post('/api/v1/alerts/channels', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const channelType = (body.channelType || 'SLACK') as AlertChannelType;
    const targetUrl = String(body.targetUrl || '').trim();
    const minSeverity = VALID_SEVERITIES.includes(body.minSeverity) ? (body.minSeverity as Severity) : 'HIGH';

    if (!VALID_CHANNEL_TYPES.includes(channelType)) {
      return res.status(400).json({ error: 'Unsupported alert channel type.' });
    }
    const validation = validateAlertChannelInput({ name, channelType, targetUrl });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const nowIso = new Date().toISOString();
    const id = `ch_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const signingSecret = crypto.randomBytes(16).toString('hex');

    const channel: AlertChannel = {
      id,
      agencyId: ctx.tenant.agency.id,
      name,
      channelType,
      targetPreview: maskWebhookTarget(channelType, targetUrl),
      hasTargetUrl: true,
      minSeverity,
      isEnabled: body.isEnabled !== false,
      signingSecretPreview: `whsec_••••${signingSecret.slice(-4)}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.channels.unshift(channel);
    store.channelSecrets.set(id, { targetUrl, signingSecret });
    deps.recordAuditForTenant(
      ctx.tenant,
      'ALERT_CHANNEL_CREATED',
      'ALERT_CHANNEL',
      channel.id,
      `Registered ${channelType} alert channel "${channel.name}"`,
      ctx.user.name,
      ctx.user.email
    );
    res.status(201).json(channel);
  });

  app.put('/api/v1/alerts/channels/:id', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const channel = store.channels.find((c) => c.id === req.params.id);
    if (!channel) return res.status(404).json({ error: 'Alert channel not found.' });

    const body = req.body || {};
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      channel.name = body.name.trim();
    }
    if (typeof body.isEnabled === 'boolean') {
      channel.isEnabled = body.isEnabled;
    }
    if (VALID_SEVERITIES.includes(body.minSeverity)) {
      channel.minSeverity = body.minSeverity;
    }
    if (typeof body.targetUrl === 'string' && body.targetUrl.trim()) {
      const validation = validateAlertChannelInput({
        name: channel.name,
        channelType: channel.channelType,
        targetUrl: body.targetUrl.trim(),
      });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      const existingSecret = store.channelSecrets.get(channel.id)?.signingSecret || crypto.randomBytes(16).toString('hex');
      store.channelSecrets.set(channel.id, { targetUrl: body.targetUrl.trim(), signingSecret: existingSecret });
      channel.targetPreview = maskWebhookTarget(channel.channelType, body.targetUrl.trim());
      channel.hasTargetUrl = true;
    }
    channel.updatedAt = new Date().toISOString();
    res.json(channel);
  });

  app.delete('/api/v1/alerts/channels/:id', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireAdminRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const idx = store.channels.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Alert channel not found.' });
    const [removed] = store.channels.splice(idx, 1);
    store.channelSecrets.delete(removed.id);
    for (const rule of store.rules) {
      rule.targetChannelIds = rule.targetChannelIds.filter((cid) => cid !== removed.id);
    }
    deps.recordAuditForTenant(
      ctx.tenant,
      'ALERT_CHANNEL_DELETED',
      'ALERT_CHANNEL',
      removed.id,
      `Deleted alert channel "${removed.name}"`,
      ctx.user.name,
      ctx.user.email
    );
    res.json({ success: true, id: removed.id });
  });

  app.post('/api/v1/alerts/channels/:id/test', async (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const channel = store.channels.find((c) => c.id === req.params.id);
    if (!channel) return res.status(404).json({ error: 'Alert channel not found.' });

    const delivery = await dispatchAlertToChannel(ctx.tenant, store, channel, {
      eventType: 'TEST_ALERT',
      severity: 'MEDIUM',
      title: `Zevkar Alert Routing Verification (${channel.name})`,
      message: `Verified HMAC-signed alert dispatch for organization "${ctx.tenant.agency.name}".`,
    });

    deps.recordAuditForTenant(
      ctx.tenant,
      'ALERT_CHANNEL_TESTED',
      'ALERT_CHANNEL',
      channel.id,
      `Test alert ${delivery.status} on "${channel.name}" (${delivery.responseSummary})`,
      ctx.user.name,
      ctx.user.email
    );
    res.json({ channel, delivery });
  });

  // Automated Guardrail & Escalation Rules
  app.get('/api/v1/alerts/rules', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    const store = getOrCreateStore(ctx.tenant.agency.id);
    res.json(store.rules);
  });

  app.post('/api/v1/alerts/rules', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const conditionType = body.conditionType as ReliabilityRuleCondition;
    const actionType = (body.actionType || 'NOTIFY_CHANNELS') as ReliabilityRuleAction;
    const severity = VALID_SEVERITIES.includes(body.severity) ? (body.severity as Severity) : 'HIGH';
    const thresholdValue = Number(body.thresholdValue ?? 3);
    const cooldownMinutes = Math.max(1, Math.min(1440, Number(body.cooldownMinutes ?? 15)));
    const targetChannelIds: string[] = Array.isArray(body.targetChannelIds)
      ? body.targetChannelIds.filter((v: unknown): v is string => typeof v === 'string')
      : [];

    if (name.length < 2) {
      return res.status(400).json({ error: 'Rule name must be at least 2 characters.' });
    }
    if (!VALID_CONDITIONS.includes(conditionType)) {
      return res.status(400).json({ error: 'Invalid guardrail rule conditionType.' });
    }
    if (!VALID_ACTIONS.includes(actionType)) {
      return res.status(400).json({ error: 'Invalid guardrail rule actionType.' });
    }
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0) {
      return res.status(400).json({ error: 'thresholdValue must be a valid non-negative number.' });
    }

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const nowIso = new Date().toISOString();
    const validChannelIds = targetChannelIds.filter((cid: string) => store.channels.some((c) => c.id === cid));

    const rule: ReliabilityRule = {
      id: `rule_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      agencyId: ctx.tenant.agency.id,
      name,
      conditionType,
      thresholdValue,
      severity,
      actionType,
      targetChannelIds: validChannelIds,
      cooldownMinutes,
      isEnabled: body.isEnabled !== false,
      triggerCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.rules.unshift(rule);
    deps.recordAuditForTenant(
      ctx.tenant,
      'GUARDRAIL_RULE_CREATED',
      'RELIABILITY_RULE',
      rule.id,
      `Created guardrail rule "${rule.name}" (${rule.conditionType} >= ${rule.thresholdValue})`,
      ctx.user.name,
      ctx.user.email
    );
    res.status(201).json(rule);
  });

  app.put('/api/v1/alerts/rules/:id', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const rule = store.rules.find((r) => r.id === req.params.id);
    if (!rule) return res.status(404).json({ error: 'Guardrail rule not found.' });

    const body = req.body || {};
    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      rule.name = body.name.trim();
    }
    if (typeof body.isEnabled === 'boolean') {
      rule.isEnabled = body.isEnabled;
    }
    if (typeof body.thresholdValue === 'number' && Number.isFinite(body.thresholdValue) && body.thresholdValue >= 0) {
      rule.thresholdValue = body.thresholdValue;
    }
    if (VALID_SEVERITIES.includes(body.severity)) {
      rule.severity = body.severity;
    }
    if (Array.isArray(body.targetChannelIds)) {
      rule.targetChannelIds = body.targetChannelIds.filter(
        (cid: unknown): cid is string => typeof cid === 'string' && store.channels.some((c) => c.id === cid)
      );
    }
    rule.updatedAt = new Date().toISOString();
    res.json(rule);
  });

  app.delete('/api/v1/alerts/rules/:id', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireAdminRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const idx = store.rules.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Guardrail rule not found.' });
    const [removed] = store.rules.splice(idx, 1);
    deps.recordAuditForTenant(
      ctx.tenant,
      'GUARDRAIL_RULE_DELETED',
      'RELIABILITY_RULE',
      removed.id,
      `Deleted guardrail rule "${removed.name}"`,
      ctx.user.name,
      ctx.user.email
    );
    res.json({ success: true, id: removed.id });
  });

  // Live Guardrail Evaluation & Escalation Dispatch
  app.post('/api/v1/alerts/evaluate', async (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    if (!deps.requireWriteRole(ctx.user, res)) return;

    const store = getOrCreateStore(ctx.tenant.agency.id);
    const ignoreCooldown = req.body?.force === true;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const slaReport = computeSlaCompliance(
      store.slaPolicy,
      {
        workflows: ctx.tenant.workflows,
        executions: ctx.tenant.executions,
        incidents: ctx.tenant.incidents,
        recoveryRequests: ctx.tenant.recoveryRequests,
      },
      nowMs
    );

    const triggers = evaluateReliabilityRules(
      store.rules,
      {
        workflows: ctx.tenant.workflows,
        executions: ctx.tenant.executions,
        incidents: ctx.tenant.incidents,
        slaReport,
      },
      nowMs,
      ignoreCooldown
    );

    const deliveriesCreated: AlertDeliveryLog[] = [];

    for (const trigger of triggers) {
      const rule = trigger.rule;
      rule.lastTriggeredAt = nowIso;
      rule.triggerCount += 1;
      rule.updatedAt = nowIso;

      if (rule.actionType === 'ESCALATE_SEVERITY') {
        for (const incId of trigger.matchedIncidentIds) {
          const inc = ctx.tenant.incidents.find((i) => i.id === incId);
          if (inc && inc.severity !== 'CRITICAL') {
            inc.severity = 'CRITICAL';
          }
        }
      }

      deps.pushNotificationForTenant(ctx.tenant, {
        type: 'CRITICAL_FAILURE',
        title: trigger.title,
        message: trigger.message,
        incidentId: trigger.matchedIncidentIds[0],
      });

      const candidateChannels =
        rule.targetChannelIds.length > 0
          ? store.channels.filter((c) => rule.targetChannelIds.includes(c.id))
          : store.channels;

      for (const ch of candidateChannels) {
        if (!ch.isEnabled || !severityMeetsMinimum(trigger.severity, ch.minSeverity)) {
          continue;
        }
        const deliv = await dispatchAlertToChannel(ctx.tenant, store, ch, {
          eventType: rule.conditionType === 'SLA_BREACH' ? 'SLA_BREACH' : 'RULE_TRIGGERED',
          severity: trigger.severity,
          title: trigger.title,
          message: trigger.message,
          ruleId: rule.id,
          ruleName: rule.name,
          matchedWorkflowIds: trigger.matchedWorkflowIds,
          matchedIncidentIds: trigger.matchedIncidentIds,
        });
        deliveriesCreated.push(deliv);
      }
    }

    deps.recordAuditForTenant(
      ctx.tenant,
      'GUARDRAILS_EVALUATED',
      'SLA_POLICY',
      ctx.tenant.agency.id,
      `Evaluated ${store.rules.filter((r) => r.isEnabled).length} enabled rule(s): ${triggers.length} triggered, ${deliveriesCreated.length} outbound alert(s) dispatched.`,
      ctx.user.name,
      ctx.user.email
    );

    res.json({
      evaluatedAt: nowIso,
      slaReport,
      rulesEvaluated: store.rules.filter((r) => r.isEnabled).length,
      triggeredCount: triggers.length,
      triggeredRules: triggers.map((t) => ({
        ruleId: t.rule.id,
        ruleName: t.rule.name,
        conditionType: t.rule.conditionType,
        severity: t.severity,
        title: t.title,
        message: t.message,
        matchedWorkflowIds: t.matchedWorkflowIds,
        matchedIncidentIds: t.matchedIncidentIds,
      })),
      deliveriesCreated,
    });
  });

  app.get('/api/v1/alerts/deliveries', (req: Request, res: Response) => {
    const ctx = deps.requireTenantAuth(req, res);
    if (!ctx) return;
    const store = getOrCreateStore(ctx.tenant.agency.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    res.json(store.deliveries.slice(0, limit));
  });
}
