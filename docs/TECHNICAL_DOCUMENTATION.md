# LeadFlow — Comprehensive Technical Documentation (V1 Engineering Manual)

This document is the authoritative engineering manual for LeadFlow V1, providing in-depth technical details on architecture, security, data pipelines, background workers, and system operations.

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Request Flow & Middleware Pipeline](#3-request-flow--middleware-pipeline)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Multi-Tenant Workspace Isolation](#5-multi-tenant-workspace-isolation)
6. [CRM Architecture](#6-crm-architecture)
7. [Lead Discovery Architecture](#7-lead-discovery-architecture)
8. [Website Enrichment Architecture](#8-website-enrichment-architecture)
9. [Workflow Engine Architecture](#9-workflow-engine-architecture)
10. [Background Processing Architecture](#10-background-processing-architecture)
11. [Redis & BullMQ Engine](#11-redis--bullmq-engine)
12. [Campaign Architecture](#12-campaign-architecture)
13. [Email Infrastructure](#13-email-infrastructure)
14. [Database Design & Indexing](#14-database-design--indexing)
15. [API Design & REST Endpoints](#15-api-design--rest-endpoints)
16. [Input Validation](#16-input-validation)
17. [Error Handling Strategy](#17-error-handling-strategy)
18. [Security Controls](#18-security-controls)
19. [CSV Processing (Import & Export)](#19-csv-processing-import--export)
20. [Caching Architecture](#20-caching-architecture)
21. [Idempotency & Fault Tolerance](#21-idempotency--fault-tolerance)
22. [Health Monitoring & Diagnostics](#22-health-monitoring--diagnostics)
23. [Scalability Considerations](#23-scalability-considerations)
24. [Deployment Considerations](#24-deployment-considerations)
25. [Known Limitations](#25-known-limitations)
26. [Future Improvements](#26-future-improvements)

---

## 1. System Overview
LeadFlow is an omnichannel lead generation, CRM, and workflow automation platform. It is engineered to bridge the entire prospect lifecycle within a single, cohesive system:
- **Discover**: Natural language geospatial search querying real-world business listings.
- **Enrich**: Automated, SSRF-safe public website scanning to discover published emails, phones, and social links.
- **Convert**: 1-click transformation of transient discovered prospects into persistent CRM leads.
- **Organize**: Full-featured pipeline management, triage, tagging, bulk actions, and CSV data mobility.
- **Engage**: Dynamic HTML/text email templates and asynchronous cohort outreach campaigns.
- **Automate**: Visual drag-and-drop workflow graphs executing condition evaluation, field updates, and automated email follow-ups.

---

## 2. Architecture
The platform is organized as a decoupled, multi-tier distributed application:
- **Presentation Tier**: React 18 single-page application built with TypeScript and Vite. Uses `@xyflow/react` for visual workflow modeling.
- **Application Tier**: Express 4 REST API built with Node.js and TypeScript, handling routing, validation, and session auth.
- **Persistence Tier**: MongoDB 6+ managed via Mongoose schemas with compound indexes enforcing tenant isolation and soft-deletes.
- **Asynchronous Task Tier**: Dedicated background worker processes consuming jobs from Redis queues powered by BullMQ.
- **Provider Abstraction Tier**: Pluggable interfaces (`IDiscoveryProvider`, `IEnrichmentProvider`, `IEmailProvider`) shielding core business logic from third-party APIs.

---

## 3. Request Flow & Middleware Pipeline

Every HTTP request traverses a strictly ordered middleware pipeline:
```text
HTTP Request
     │
     ▼
[CORS Middleware] ────────► Validates origin against CLIENT_URL, enables credentials
     │
     ▼
[express.json()] ─────────► Parses JSON body (10MB payload limit)
     │
     ▼
[cookieParser()] ─────────► Parses incoming Cookie headers
     │
     ▼
[requireAuth] ────────────► Reads leadflow_token cookie, verifies JWT, loads User into req.user
     │
     ▼
[Route Validator] ────────► Custom validator checks schema, lengths, and allowed field values
     │
     ▼
[Controller Handler] ─────► Executes service logic within tenant boundary
     │
     ▼
[AppError Boundary] ──────► Normalizes errors into JSON { success: false, error, code? }
```

---

## 4. Authentication Architecture
- **Stateless JWT with State Verification**: JSON Web Tokens signed with HMAC-SHA256 (`JWT_SECRET`) carrying `{ userId, workspaceId }` with a 7-day expiration.
- **Cookie Security**: Delivered via `Set-Cookie` with `HttpOnly; SameSite=Lax; Path=/`. In production, `Secure` is enabled. JavaScript running in the browser cannot read or exfiltrate the token.
- **Password Security**: Passwords are hashed using `bcryptjs` with a work factor of 12 rounds before database storage. Raw passwords are never logged or stored.
- **User Validation**: On every authenticated request, `requireAuth` verifies the token signature and verifies that the `User` record exists and is active in MongoDB.

---

## 5. Multi-Tenant Workspace Isolation
LeadFlow is designed from the ground up for multi-tenant isolation:
1. **Tenant Anchor**: Every user belongs to a `Workspace`.
2. **Context Binding**: On authentication, `req.user.workspaceId` is extracted from the cryptographically verified JWT.
3. **Query Invariance**: All database queries (`find`, `findOne`, `updateOne`, `countDocuments`) enforce `{ workspaceId: req.user.workspaceId }`. Requests cannot override `workspaceId` via query strings or request bodies.
4. **Relational Integrity**: When linking dependent models (e.g. associating an `EmailTemplate` to a `Campaign`), the backend verifies that both resources share the identical `workspaceId`.

---

## 6. CRM Architecture
The CRM core manages leads through their sales pipeline:
- **Pipeline Stages**: `new` ➔ `contacted` ➔ `qualified` ➔ `converted` / `lost`.
- **Priority Triage**: `low`, `medium`, `high`.
- **Search & Filtering**: Full-text searching across `firstName`, `lastName`, `email`, and `company` using regex prefix queries supported by compound indexes.
- **Pagination**: Deterministic page/limit pagination returning total record counts, page counts, and hasNext/hasPrev indicators.
- **Soft Deletion**: Implemented via `isArchived: true`. Leads are never permanently deleted by standard operations, preserving audit trails and association history.
- **Bulk Actions**: Batch status updates, batch archiving, and batch deletion executed within single tenant-scoped database operations.

---

## 7. Lead Discovery Architecture
LeadFlow provides a pluggable discovery engine:
- **`IDiscoveryProvider` Interface**: Defines `search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult>`.
- **Default Production Provider (`osm_combined`)**:
  - Leverages **OpenStreetMap Nominatim** for geocoding and natural-language location resolution.
  - Leverages the **Overpass API** for bounded, tag-specific amenity and commercial venue extraction.
  - Normalizes external records into standard `DiscoveredProspect` objects with stable IDs (`osm_node_<id>`).
  - Adheres strictly to the Open Database License (ODbL 1.0) and polite 1-request/sec rate limiting.
- **Experimental Provider (`apify`)**:
  - Optional integration with the Apify Google Maps Crawler Actor (`compass/crawler-google-places`).
  - Protected by a two-tier safety system:
    - Tier 1: Per-workspace atomic daily rate limit (`WorkspaceUsageService`, default: 10 searches/day).
    - Tier 2: In-memory session run ceiling.
  - On workspace limit exhaustion, returns HTTP 429 (`APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED`) and guides the user to manually switch to Free Discovery without silent substitution.

---

## 8. Website Enrichment Architecture
- **Purpose**: Enriches discovered business prospects using publicly accessible information on their official website.
- **SSRF Safety Engine**:
  - Resolves target domain to IP addresses via Node.js `dns.lookup`.
  - Rejects private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Rejects loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), and AWS/GCP cloud metadata endpoints (`169.254.169.254`).
- **Bounded Scraping**:
  - Enforces a 7-second timeout using `AbortController`.
  - Enforces a maximum response size limit of 2MB to prevent memory exhaustion.
  - Follows up to a maximum of 3 redirects, re-verifying SSRF safety on each hop.
- **Extraction Heuristics**:
  - **Email**: Extracted from `mailto:` links and body regex patterns; filters out `.png`, `.jpg`, and dummy assets.
  - **Phone**: Extracted from `tel:` links and standard phone regex patterns.
  - **Socials**: Discovers official links to LinkedIn, Facebook, Instagram, X/Twitter, YouTube, and GitHub.
- **Data Provenance**: Every enriched field records `{ value, source: "website", extractedAt }` so user interfaces can display distinct provenance badges.

---

## 9. Workflow Engine Architecture
- **Directed Acyclic Graph (DAG) Validation**:
  - Workflows are defined as nodes and edges.
  - Validated via Depth-First Search (DFS) with recursion stack tracking to detect and reject cycles.
  - Validates that exactly ONE trigger node exists.
  - Validates that all condition and action nodes are reachable from the trigger.
- **Supported Nodes**:
  - `trigger`: `lead_created`, `lead_updated`, `manual`.
  - `condition`: Evaluates lead fields using `equals`, `not_equals`, `contains`, `not_contains`, `exists`, `not_exists`. Branches into `yes` and `no` handles.
  - `action`:
    - `send_email`: References an active template in the workspace and sends personalized email.
    - `update_lead`: Updates an allowed lead field (`status`, `priority`, etc.) directly in MongoDB.
- **Execution Engine**:
  - Traversal is bounded to a maximum of 50 steps to prevent runaway execution.
  - Step-by-step audit logs are written to `WorkflowExecution.executionLog`.

---

## 10. Background Processing Architecture
- **Separation of Concerns**: HTTP request handling is decoupled from long-running operations.
- **Dedicated Processes**: Workers run in standalone Node.js processes (`workflow.worker.ts` and `campaign.worker.ts`).
- **Resilient Startup**: If Redis is offline or unconfigured, the Express API boots normally. Endpoints requiring background queues return HTTP 503 cleanly without crashing.

---

## 11. Redis & BullMQ Engine
- **Queue Definitions**:
  - `leadflow-workflows`: Handles workflow graph execution jobs.
  - `leadflow-campaigns`: Handles individual lead outreach email jobs.
- **Retry Policies**:
  - Bounded to 3 attempts.
  - Uses exponential backoff (`delay: 1000ms, type: 'exponential'`).
- **Memory Management**: Automatically prunes completed jobs exceeding 500 and failed jobs exceeding 1,000 to conserve Redis memory.

---

## 12. Campaign Architecture
- **Lifecycle States**: `draft` ➔ `active` ➔ `completed` / `paused`.
- **Cohort Association**: Leads are linked to campaigns via the `CampaignLead` junction collection with a unique compound index (`{ campaignId: 1, leadId: 1 }`).
- **Asynchronous Dispatch**:
  - Triggered via `POST /api/campaigns/:id/dispatch`.
  - Gathers pending `CampaignLead` records and enqueues them into BullMQ.
  - Returns `HTTP 202 Accepted` immediately with queued counts.
  - The worker renders templates per lead and sends emails via SMTP.

---

## 13. Email Infrastructure
- **`IEmailProvider` Interface**: Decoupled contract with method `sendEmail(options: SendEmailOptions): Promise<SendEmailResult>`.
- **SMTP Implementation (`SmtpEmailProvider`)**:
  - Powered by Nodemailer with pooled connection reuse.
  - Enforces `rejectUnauthorized: true` for TLS verification.
  - Credentials and connection strings are masked from logs and API errors.
- **Template Rendering Engine**:
  - Interpolates supported variables (`{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}`, `{{phone}}`, `{{source}}`, `{{status}}`, `{{priority}}`).
  - Unknown variables are rejected during template creation.
  - Missing lead values resolve cleanly to empty strings (`""`).

---

## 14. Database Design & Indexing
See [`docs/ER_DIAGRAM.md`](./ER_DIAGRAM.md) for full schema definitions.
Key compound indexes:
- `Lead`: `{ workspaceId: 1, isArchived: 1, createdAt: -1 }`, `{ workspaceId: 1, email: 1 }`
- `Campaign`: `{ workspaceId: 1, isArchived: 1, status: 1 }`
- `CampaignLead`: `{ campaignId: 1, leadId: 1 }` (unique)
- `Workflow`: `{ workspaceId: 1, status: 1, triggerType: 1 }`
- `WorkspaceUsage`: `{ workspaceId: 1, date: 1 }` (unique)

---

## 15. API Design & REST Endpoints
All API routes are prefixed with `/api` and return standardized JSON:
- Success: `{ success: true, data: ... }`
- Failure: `{ success: false, error: string, code?: string }`

### Core Route Summary:
- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Leads**: `GET /api/leads`, `POST /api/leads`, `GET /api/leads/:id`, `PATCH /api/leads/:id`, `DELETE /api/leads/:id`, `POST /api/leads/bulk-status`, `POST /api/leads/bulk-archive`, `POST /api/leads/bulk-delete`, `POST /api/leads/upload`
- **Discovery**: `GET /api/discovery/config`, `POST /api/discovery/search`, `POST /api/discovery/enrich`, `POST /api/discovery/convert`
- **Email Templates**: `GET /api/email-templates`, `POST /api/email-templates`, `GET /api/email-templates/:id`, `PATCH /api/email-templates/:id`, `DELETE /api/email-templates/:id`
- **Campaigns**: `GET /api/campaigns`, `POST /api/campaigns`, `GET /api/campaigns/:id`, `PATCH /api/campaigns/:id`, `DELETE /api/campaigns/:id`, `POST /api/campaigns/:id/leads`, `GET /api/campaigns/:id/leads`, `POST /api/campaigns/:id/dispatch`
- **Workflows**: `GET /api/workflows`, `POST /api/workflows`, `GET /api/workflows/:id`, `PATCH /api/workflows/:id`, `DELETE /api/workflows/:id`, `POST /api/workflows/:id/test`, `GET /api/workflows/:id/executions`
- **Health**: `GET /api/health`

---

## 16. Input Validation
- **Layered Validation**: Express route middlewares intercept payloads before controllers.
- **Strict Whitelisting**: Statuses, priorities, and workflow node types are strictly verified against exported enum arrays.
- **Boundary Checks**: String lengths, pagination bounds (`limit <= 50`), and URL protocol schemes (`http:`/`https:`) are enforced.

---

## 17. Error Handling Strategy
- **`AppError` Class**: Extends native `Error` with `statusCode`, `isOperational`, and optional machine-readable `code`.
- **Operational vs Programmer Errors**: Operational errors (bad input, unauthenticated, rate limits) return structured HTTP 4xx responses. Unhandled exceptions return generic HTTP 500 messages to prevent stack trace leaks.
- **Fail-Safe Database Errors**: If usage tracking database calls fail, requests fail-closed with HTTP 503 (`USAGE_TRACKING_UNAVAILABLE`) to prevent unmetered third-party spend.

---

## 18. Security Controls
- **Cross-Site Scripting (XSS)**: Data is rendered safely via React DOM; template interpolation escapes HTML entities.
- **Cross-Site Request Forgery (CSRF)**: Cookies use `SameSite=Lax`. Modifying endpoints require JSON `Content-Type`.
- **Server-Side Request Forgery (SSRF)**: Outbound enrichment requests resolve DNS and block private, loopback, and cloud metadata IP ranges.
- **Credential Masking**: Tokens, SMTP passwords, and database connection strings are excluded from logs, error messages, and API responses.

---

## 19. CSV Processing (Import & Export)
- **Import (`POST /api/leads/upload`)**:
  - Uses `multer` with memory storage and 5MB file size limits.
  - Parsed using `csv-parse` with stream processing.
  - Automatically maps common header variations (`First Name`, `fname`, `Email Address`, etc.).
  - Deduplicates incoming records against existing workspace leads by email.
- **Export (`client/src/utils/csv.util.ts`)**:
  - Generates RFC 4180 compliant CSV files with full character escaping.
  - Client-side streaming export for discovered prospects and CRM leads.

---

## 20. Caching Architecture
- **Website Enrichment Cache**: In-memory LRU cache storing scraped contact information for 15 minutes keyed by normalized domain. Prevents repeated outbound HTTP requests to the same target website.
- **Queue Memory Retention**: BullMQ queues prune old job data automatically.

---

## 21. Idempotency & Fault Tolerance
- **Email Delivery Idempotency**: `CampaignLead` checks `status === 'sent'` before calling the email provider. If a job is re-attempted after failure, previously sent emails are never re-sent.
- **Workflow Step Idempotency**: Node execution logs record step completion; duplicate trigger invocations terminate early.
- **Rate Limit Atomicity**: Quota reservation uses atomic `$inc` operations in MongoDB with condition `{ count: { $lt: maxLimit } }`.

---

## 22. Health Monitoring & Diagnostics
- **Endpoint**: `GET /api/health`
- **Telemetry**: Returns system uptime, memory usage, environment status, MongoDB connectivity state, and Redis ping status.

---

## 23. Scalability Considerations
- **Horizontal API Scaling**: The Express API server is stateless. Multiple instances can run behind a load balancer (e.g. Nginx, AWS ALB).
- **Independent Worker Scaling**: Worker processes can be scaled independently based on queue depth.
- **Indexed Read Queries**: All list and search queries hit compound indexes, avoiding full collection scans.

---

## 24. Deployment Considerations
- **Frontend**: Deploy to Vercel or Netlify as a static single-page application.
- **Backend API**: Deploy to a Node.js runtime environment (e.g. Render, Railway, AWS ECS, DigitalOcean).
- **Database**: MongoDB Atlas M0 (Free Tier) or dedicated cluster.
- **Redis**: Redis Cloud (Free 30MB Tier) or Upstash Redis.
- **Environment**: Set `NODE_ENV=production` and enforce HTTPS.

---

## 25. Known Limitations
1. **JavaScript-Rendered Websites**: The free enrichment scraper only inspects static HTML. Client-side Single Page Applications (SPAs) that require browser rendering without SSR will yield minimal text.
2. **Contact Form vs Direct Email**: Businesses that only provide contact forms without publishing an email address cannot have an email extracted via static scraping.
3. **Third-Party Platform Scraping**: Direct, unrestricted scraping of authenticated social networks (LinkedIn, Instagram) is intentionally not implemented to respect terms of service.
4. **Nominatim Usage Limits**: OpenStreetMap Nominatim enforces a strict 1-second delay between queries and should not be used for massive batch scraping without self-hosting.

---

## 26. Future Improvements
*(Labeled as future roadmap enhancements)*
- **Additional Discovery Providers**: Integration with Apollo, ZoomInfo, or Google Places API (pending stakeholder approval).
- **Advanced Lead Scoring**: Machine learning / rules-based lead qualification scores.
- **Multi-Channel Outreach**: Adding WhatsApp, SMS (Twilio), and LinkedIn integration.
- **Workflow Webhook Triggers**: Inbound webhooks to trigger workflows from external tools (Stripe, Zapier).
- **Custom CRM Fields**: User-defined custom schema fields per workspace.
