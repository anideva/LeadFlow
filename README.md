# LeadFlow — Omnichannel Lead Generation & Workflow Automation Platform

LeadFlow is an omnichannel lead generation and workflow automation platform built with React, Vite, TypeScript, Node.js, Express, and MongoDB.

---

## Email Infrastructure (Phase 5)

LeadFlow includes a decoupled, provider-independent email infrastructure layer designed to power future campaign execution and workflow automation triggers.

### Conceptual Architecture

```text
Future API / Campaign / Workflow
             ↓
       Email Service
 (Validation, Normalization, Error Translation)
             ↓
   IEmailProvider Interface
             ↓
       SMTP Provider
 (Nodemailer, Strict TLS, Env Config)
             ↓
        Email Server
```

### Environment Variables

Configure SMTP credentials in `server/.env` (see `server/.env.example`):

```env
# Optional: Email Service Configuration (SMTP)
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
EMAIL_FROM_NAME="LeadFlow"
EMAIL_FROM_ADDRESS=noreply@leadflow.io
```

### Non-Breaking Startup

The server starts up cleanly in development even if SMTP environment variables are not configured. If email sending is attempted when credentials are absent, the service fails safely with HTTP `503 Service Unavailable`.

### Provider Abstraction (`IEmailProvider`)

Application features interact exclusively with `EmailService` and the `IEmailProvider` interface. The initial provider is `SmtpEmailProvider` (powered by Nodemailer). Future providers (e.g. AWS SES, Resend, SendGrid) can be plugged in without changing business logic.

### Development Testing Endpoint

Authenticated workspace users can test email delivery via:

- **Endpoint:** `POST /api/email/test`
- **Headers:** `Cookie: leadflow_token=<jwt>`
- **Body:**
  ```json
  {
    "to": "recipient@example.com",
    "subject": "LeadFlow Email Test",
    "text": "This is a test email message."
  }
  ```

### Security Considerations

- **Strict TLS Verification:** All SMTP connections enforce `rejectUnauthorized: true`. Insecure workarounds are strictly prohibited.
- **Credential Masking:** SMTP passwords and authentication tokens are never logged or returned in API responses or errors.
- **No Request Overrides:** API requests cannot supply custom SMTP hosts, ports, or credentials; emails are always dispatched via the server's configured sender.
- **Authentication Required:** All email routes are protected by the `requireAuth` middleware.

---

## Email Templates & Campaign Foundation (Phase 6)

Phase 6 introduces reusable Email Templates and Campaign models, preparing LeadFlow for campaign orchestration without dispatching bulk emails or introducing queues yet.

### Email Templates (Part A)

- **Endpoints:**
  - `POST /api/email-templates` — Create template
  - `GET /api/email-templates` — List templates (workspace-scoped, paginated)
  - `GET /api/email-templates/:id` — Get single template
  - `PATCH /api/email-templates/:id` — Update template
  - `DELETE /api/email-templates/:id` — Soft-delete / archive template
- **Supported Template Variables:**
  - `{{firstName}}`
  - `{{lastName}}`
  - `{{email}}`
  - `{{phone}}`
  - `{{company}}`
  - `{{source}}`
  - `{{status}}`
  - `{{priority}}`
- **Variable Validation & Rendering:**
  - Templates undergo strict variable inspection on creation and update. Unsupported variables (e.g. `{{salary}}`, `{{user.password}}`, expressions) are rejected with HTTP `400 Bad Request`.
  - Rendering safely replaces placeholders with lead data. Missing values resolve cleanly to an empty string `""`. No `eval` or executable template syntax is used.

### Campaign Foundation (Part B)

- **Endpoints:**
  - `POST /api/campaigns` — Create campaign (references an active template in the same workspace)
  - `GET /api/campaigns` — List campaigns (filtered by status: `draft`, `active`, `completed`, `paused`)
  - `GET /api/campaigns/:id` — Get campaign with populated template summary
  - `PATCH /api/campaigns/:id` — Update campaign
  - `DELETE /api/campaigns/:id` — Soft-delete / archive campaign
  - `POST /api/campaigns/:id/leads` — Batch associate leads with campaign (`{ "leadIds": ["..."] }`)
- **Data Integrity & Multi-Tenancy:**
  - **Campaign ↔ Template:** A campaign can only reference an active, unarchived template belonging to the identical workspace.
  - **Campaign ↔ Leads:** Leads are associated via a dedicated `CampaignLead` model with a unique compound index (`{ campaignId: 1, leadId: 1 }`). Cross-workspace and archived leads are rejected as invalid. Duplicate associations are prevented.
  - **Phase Boundary:** No campaign emails are sent in this phase; statuses (`draft`, `active`, `completed`, `paused` for campaigns; `pending`, `sent`, `failed` for campaign leads) represent lifecycle states only.

---

## Workflow Automation Foundation (Phase 7)

Phase 7 introduces deterministic, event-driven workflow automations into LeadFlow, providing structured DAG validation, CRUD APIs, deterministic test execution, and a visual React Flow workflow editor.

### Workflow Architecture & Core Concepts

```text
       Trigger Node (lead_created | lead_updated | manual)
                                ↓
                 Condition Node (lead_field evaluation)
                        /              \
                   [YES]                [NO]
                    ↓                    ↓
          Action: Send Email      Action: Update Lead
          (Deferred to Phase 8)   (Synchronously executed)
```

- **Single Source of Truth:** The backend server strictly owns and validates workflow definitions and execution state. React Flow (`@xyflow/react`) is exclusively a UI representation and is never trusted as a security boundary.
- **DAG Requirement:** Workflows must be Directed Acyclic Graphs (DAGs). Cycles are detected via DFS coloring and rejected. Disconnected nodes (nodes unreachable from the trigger) are strictly rejected.
- **Single Trigger Rule:** Workflows require exactly ONE trigger node (`lead_created`, `lead_updated`, or `manual`). Workflows with 0 or >1 triggers are rejected.
- **Supported Node Types:**
  - `trigger`: Emits entry into the workflow (`lead_created`, `lead_updated`, `manual`).
  - `condition`: Evaluates a lead field (`firstName`, `lastName`, `email`, `phone`, `company`, `source`, `status`, `priority`) using deterministic operators (`equals`, `not_equals`, `contains`, `not_contains`, `exists`, `not_exists`). Branches exclusively into `yes` and `no` handles.
  - `action`:
    - `send_email`: References an active email template in the same workspace. In Phase 7, this action is recognized and logged as deferred (`deferred_phase_8`) without sending real email.
    - `update_lead`: Synchronously updates an allowed lead field (`firstName`, `lastName`, `email`, `phone`, `company`, `source`, `status`, `priority`) directly in MongoDB.
- **Deterministic Execution Engine:**
  - Evaluates condition expressions against lead data and traverses the DAG step-by-step.
  - Guarded by a maximum traversal limit (50 steps) and node visitation tracking to fail safely and prevent runaway execution or process blocking.
  - Records execution audits in `WorkflowExecution` documents (`pending`, `running`, `completed`, `failed`).
- **Current Limitation (Resolved in Phase 8):** In Phase 7, workflow actions were synchronous dry-runs and `send_email` was deferred. Phase 8 transitions all workflow execution to asynchronous BullMQ queues backed by Redis with real email delivery.

### Workflow API Endpoints

All endpoints require authentication (`requireAuth`) and are strictly workspace-isolated:

- `POST /api/workflows` — Create workflow (validates full graph and template references).
- `GET /api/workflows` — List workflows (filtered by status, triggerType, search).
- `GET /api/workflows/:id` — Retrieve workflow by ID.
- `PATCH /api/workflows/:id` — Update workflow (re-validates graph on structure or activation changes).
- `DELETE /api/workflows/:id` — Soft-delete / archive workflow.
- `POST /api/workflows/:id/test` — Test execution against a workspace lead (`{ "leadId": "..." }`) — returns HTTP 202 Accepted.
- `GET /api/workflows/executions/:executionId` — Retrieve execution record and live step log.
- `GET /api/workflows/:id/executions` — Paginated history of executions for a workflow.

---

## Background Processing & Workflow Automation Engine (Phase 8)

Phase 8 transitions workflow execution from synchronous HTTP handlers to a scalable, asynchronous background processing architecture powered by **BullMQ** and **Redis**, featuring dedicated workers, bounded retry policies, execution idempotency, real email dispatch, and non-breaking server startup.

### Architecture Overview

```text
[HTTP Request / Event Trigger]
  │ (e.g. Lead Created / POST /api/workflows/:id/test)
  ▼
[WorkflowTriggerService]
  │ Creates WorkflowExecution record (status: 'pending')
  ▼
[BullMQ Queue: leadflow-workflows] ──► [Redis]
                                         │
                        Job Dispatched   ▼
                              [Workflow Worker Process]
                                         │
                                         ▼
                             [WorkflowExecutionService]
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  ▼                                             ▼
          [Condition Node]                              [Action Node]
       (Evaluates Lead Data)                                    │
                                           ┌────────────────────┴────────────────────┐
                                           ▼                                         ▼
                                  [Send Email Action]                       [Update Lead Action]
                               - Renders template with lead data         - Updates MongoDB Lead
                               - Dispatches via EmailService             - Idempotent field update
                               - Guarded by email idempotency
```

### Core Architecture Components

1. **Redis Configuration & Resilient Startup:**
   - Typed configuration loaded from environment variables (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`).
   - Strict TLS certificate verification when TLS is enabled (`rejectUnauthorized: true`).
   - Non-breaking server startup: if Redis is unavailable or unconfigured, the Express server boots cleanly. Unrelated API endpoints (auth, leads, templates, campaigns) operate normally.
   - Any endpoint requiring background queueing cleanly throws HTTP 503 (`Background processing queue is currently unavailable.`) and records the execution as `failed`.

2. **BullMQ Queue (`leadflow-workflows`):**
   - **Retry Policy:** Bounded to 3 attempts with exponential backoff (`delay: 1000ms, type: 'exponential'`).
   - **Job Retention:** Automatically removes completed jobs beyond 500 and failed jobs beyond 1,000 to conserve Redis memory.
   - **Queue Availability Check:** Evaluates Redis connection readiness before attempting job operations to prevent hanging requests.

3. **Execution Lifecycle & Idempotency:**
   - **Lifecycle Transitions:** `pending` ➔ `running` ➔ `completed` / `failed`.
   - **Execution Idempotency:** The worker inspects the database record before processing. If an execution is already `completed`, the job terminates immediately without re-running nodes.
   - **Action Idempotency:** For `send_email` actions, the execution log is checked before dispatching. If the step previously succeeded in an earlier attempt, re-sending is bypassed to eliminate duplicate emails on retries.
   - **Lead Updates:** Field modifications apply state directly to MongoDB idempotently.

4. **Real Email Service Integration:**
   - In `send_email` action nodes, active email templates in the matching workspace are resolved.
   - Lead fields (`firstName`, `lastName`, `email`, `company`, etc.) are interpolated into template subject, HTML, and text via `renderTemplate`.
   - Messages are dispatched via `EmailService.sendEmail` over configured SMTP infrastructure.

5. **Trigger Automations:**
   - `lead_created`: Hooked into `LeadService.createLead`. Creates and enqueues execution jobs for all active, unarchived workflows matching the workspace and trigger type.
   - `manual`: Enqueued via `POST /api/workflows/:id/test` for isolated testing.

6. **Worker Process & Graceful Shutdown:**
   - Dedicated worker entrypoint: `server/src/workers/workflow.worker.ts`.
   - Concurrency limit: defaults to 5 concurrent jobs.
   - Graceful shutdown intercepts `SIGINT` and `SIGTERM` signals, closes the BullMQ worker safely, waits for active jobs to finish, and closes MongoDB connections cleanly.

### Running the Worker

The background worker runs as a dedicated Node.js process alongside the main Express API server:

```bash
# In server/ directory

# Development mode with hot-reloading:
npm run worker:dev

# Production build and start:
npm run build
npm run worker:start
```

### Local Development Modes

- **With Redis:**
  - Start local Redis server (e.g. `redis-server` or Docker: `docker run -p 6379:6379 redis:alpine`).
  - Configure `REDIS_HOST=127.0.0.1` and `REDIS_PORT=6379` in `server/.env`.
  - Start the server (`npm run dev`) and worker (`npm run worker:dev`).
  - Workflows queue and process in background smoothly.

- **Without Redis (Graceful Fallback):**
  - Omit Redis configuration or keep Redis stopped.
  - Server starts normally and health check reports `redis: "disconnected"`.
  - Workflow queue attempts safely return HTTP 503 with user-friendly error messages.

