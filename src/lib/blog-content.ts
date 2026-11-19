export interface BlogArticle {
  slug: string;
  title: string;
  category: 'Architecture' | 'n8n Operations' | 'Safety & Recovery' | 'Python & FastAPI';
  publishedLabel: string;
  readTime: string;
  summary: string;
  sections: {
    heading: string;
    paragraphs: string[];
    code?: string;
  }[];
}

export const BLOG_CATEGORIES = [
  'All',
  'Architecture',
  'n8n Operations',
  'Safety & Recovery',
  'Python & FastAPI',
] as const;

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: 'idempotent-workflow-recovery-sha256',
    title: 'Why Blind Workflow Retries Break Production Billing—and How Idempotency Keys Prevent Them',
    category: 'Safety & Recovery',
    publishedLabel: 'Engineering Guide',
    readTime: '6 min read',
    summary:
      'Learn how deterministic SHA-256 idempotency hashes, retry ceilings, and cooldown windows stop duplicate invoices and runaway loops.',
    sections: [
      {
        heading: 'The hidden danger of automatic retry loops',
        paragraphs: [
          'When an HTTP 429 or upstream gateway timeout hits halfway through a multi-step billing workflow, blindly clicking Retry can re-trigger every preceding node—charging a card twice or sending duplicate accounting journal entries.',
          'Zevkar AI pairs every RecoveryRequest and RecoveryAttempt with a deterministic SHA-256 idempotency key derived from incident, strategy, and attempt number.',
        ],
      },
      {
        heading: 'Enforcing cooldowns and verification instead of fire-and-forget',
        paragraphs: [
          'Before dispatching a retry, the Recovery Engine verifies preconditions: approval state, remaining retry budget, cooldown expiry, and absence of concurrent IN_PROGRESS locks.',
          'After n8n returns a new execution ID, the engine fetches GET /executions/{newId} to verify whether the run truly succeeded rather than marking an unverified dispatch as resolved.',
        ],
        code: `key = sha256(f"{recovery_request_id}:{attempt_number}:{strategy}")[:32]`,
      },
    ],
  },
  {
    slug: 'watermark-based-n8n-execution-sync',
    title: 'Designing Reliable n8n Execution Polling Without Missing Late Failures',
    category: 'n8n Operations',
    publishedLabel: 'Operations Playbook',
    readTime: '5 min read',
    summary:
      'How cursor pagination, persistent polling watermarks, and overlap windows catch long-running executions transitioning from RUNNING to FAILED.',
    sections: [
      {
        heading: 'Why naive timestamp polling misses failures',
        paragraphs: [
          'Workflows that start at 10:00 UTC and time out at 10:12 UTC are often missed if a poller advances its checkpoint strictly to 10:01 UTC without revisiting in-flight runs.',
          'Zevkar AI stores a watermark per integration with a configurable overlap window (default 300s) and upserts execution records by (integration_id, external_execution_id) so RUNNING -> FAILED transitions update cleanly.',
        ],
      },
      {
        heading: 'Detecting stuck workflows safely',
        paragraphs: [
          'Standard workflows stuck beyond DEFAULT_STUCK_EXECUTION_SECONDS (900s) trigger stuck-execution incidents, while explicitly tagged long-running workflows receive extended thresholds (14,400s).',
        ],
      },
    ],
  },
  {
    slug: 'deterministic-fallback-with-ai-diagnosis',
    title: 'Pairing Gemini Root-Cause Diagnosis with Deterministic Safety Guardrails',
    category: 'Architecture',
    publishedLabel: 'System Design',
    readTime: '5 min read',
    summary:
      'Why production reliability tools cannot treat LLM output as an infallible authority—and how deterministic classifiers preserve uptime.',
    sections: [
      {
        heading: 'Structured diagnosis without blind trust',
        paragraphs: [
          'Large language models excel at translating cryptic stack traces and HTTP responses into plain stakeholder summaries and concrete remediation steps.',
          'However, AI recommendations must never override organizational safety boundaries. Even if an AI recommendation suggests an automated retry, financial, auth, database, or CRITICAL incidents remain gated behind human approval when required by policy.',
        ],
      },
      {
        heading: 'Graceful degradation when AI keys are absent',
        paragraphs: [
          'If GEMINI_API_KEY is unconfigured or rate-limited, Zevkar AI falls back to deterministic pattern matching across AUTH_FAILURE, RATE_LIMIT, DATABASE_FAILURE, TIMEOUT, and SCHEMA_MISMATCH categories.',
        ],
      },
    ],
  },
  {
    slug: 'fastapi-webhook-exception-telemetry',
    title: 'Instrumenting FastAPI Background Workers for Centralized Incident Triage',
    category: 'Python & FastAPI',
    publishedLabel: 'Developer Tutorial',
    readTime: '4 min read',
    summary:
      'Forward unhandled Python exceptions from Celery tasks and FastAPI background endpoints into a unified multi-tenant incident queue.',
    sections: [
      {
        heading: 'Keeping Python workers visible alongside no-code tools',
        paragraphs: [
          'Most businesses operate hybrid automation stacks: n8n handles webhook orchestration while custom Python scripts and FastAPI services run heavy transforms or database syncs.',
          'Sending structured JSON error reports to POST /api/v1/webhooks/listener unifies both worlds inside a single incident queue, AI diagnosis flow, and audit history.',
        ],
      },
    ],
  },
];

export function filterBlogArticles(category: string, query: string): BlogArticle[] {
  const q = query.trim().toLowerCase();
  return BLOG_ARTICLES.filter((article) => {
    const matchesCategory = category === 'All' || article.category === category;
    const matchesQuery =
      !q ||
      article.title.toLowerCase().includes(q) ||
      article.summary.toLowerCase().includes(q) ||
      article.category.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });
}
