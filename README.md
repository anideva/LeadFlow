# LeadFlow — Omnichannel Lead Generation, CRM & Workflow Automation Platform

[![CI / Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Automated Tests](https://img.shields.io/badge/Tests-46%2F46%20Passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

LeadFlow is an enterprise-ready, omnichannel lead generation, CRM, and workflow automation platform. Built with a modern TypeScript stack, it empowers sales and marketing teams to discover prospective businesses, enrich them with verified contact data, organize pipelines, dispatch email campaigns asynchronously, and automate follow-ups using a visual workflow engine.

---

## Live Demo & Deployment

| Resource | Link | Description |
| :--- | :--- | :--- |
| **Live Application** | [https://lead-flow-nine-lyart.vercel.app](https://lead-flow-nine-lyart.vercel.app) | Production frontend hosted on Vercel |
| **Backend API (Health Check)** | [https://leadflow-e9m2.onrender.com/api/health](https://leadflow-e9m2.onrender.com/api/health) | Live backend service with health & worker telemetry |
| **GitHub Repository** | [https://github.com/anideva/LeadFlow](https://github.com/anideva/LeadFlow) | Monorepo source code, tests, and documentation |

> [!NOTE]
> The backend runs on Render's free tier and spins down after 15 minutes of inactivity. If visiting after a period of dormancy, the initial request may take ~30–45 seconds while the instance wakes up.

---

## Demo Flow (Evaluator Walkthrough)

1. **Authentication**: Register or log in with secure HTTP-only cookies; session is restored automatically without client storage.
2. **Workspace Isolation**: Multi-tenant data segregation ensuring users only access their organization's leads and assets.
3. **Lead Discovery**: Search local businesses via Free OpenStreetMap / Overpass queries or optional Apify Google Maps integration.
4. **Website Enrichment**: One-click public website parsing extracting contact emails, phone numbers, and official social profiles with SSRF protection.
5. **Lead CRM**: View, filter, triage, update pipeline stages, and export leads to CSV.
6. **Email Templates**: Create reusable email templates with validated placeholders (`{{firstName}}`, `{{companyName}}`).
7. **Campaigns**: Batch-enroll leads into campaigns and launch asynchronous email delivery queued into BullMQ (HTTP 202).
8. **Visual Workflows**: Drag-and-drop DAG automation canvas powered by React Flow with triggers, conditions, and actions.
9. **System Health**: Inspect real-time operational telemetry (`GET /api/health`) reporting database, Redis, queues, and worker loop status.

---

## Documentation Navigation
- 📖 [Technical Documentation (Complete Manual)](./docs/TECHNICAL_DOCUMENTATION.md)
- 🏗️ [System Architecture & Data Flows](./docs/ARCHITECTURE.md)
- 🗄️ [Entity Relationship (ER) & Database Design](./docs/ER_DIAGRAM.md)

---

## 1. Project Overview

LeadFlow bridges the gap between disparate prospecting tools, CRM databases, email outreach systems, and workflow engines into a unified platform.

### The Complete User Journey
```text
  [1. Discover Prospects]
           │ Natural language search (OpenStreetMap Nominatim / Overpass POI / Optional Apify)
           ▼
  [2. Enrich Business Data]
           │ SSRF-safe public website scanning (Emails, Phones, Official Socials, Provenance)
           ▼
  [3. Save as CRM Leads]
           │ 1-click conversion with deduplication and multi-tenant workspace isolation
           ▼
  [4. Organize & Triage Leads]
           │ Search, pipeline stages, priority filters, bulk updates, and CSV import/export
           ▼
  [5. Create Email Templates]
           │ Reusable HTML/text templates with validated placeholders ({{firstName}}, etc.)
           ▼
  [6. Launch Outreach Campaigns]
           │ Batch lead enrollment and asynchronous background dispatch (HTTP 202 Accepted)
           ▼
  [7. Visual Workflow Automation]
           │ Drag-and-drop React Flow builder executing condition branches and automated actions
```

---

## 2. Key Features

### Authentication & Multi-Tenancy
- **Secure Sessions**: Stateless JSON Web Tokens (JWT) stored in secure HTTP-only, `SameSite=Lax` cookies. Passwords hashed using `bcryptjs` (12 rounds). The frontend does not store the JWT in `localStorage` or `sessionStorage`, mitigating token theft via XSS.
- **Workspace Isolation**: Every user, lead, template, campaign, and workflow belongs to a `Workspace`. Cross-tenant data leakage is strictly prevented at the database query layer.

### Lead Discovery Engine
- **Free Geospatial Discovery**: Integrated with **OpenStreetMap Nominatim** and the **Overpass API** (`DISCOVERY_PROVIDER=osm_combined`) for real-world POI discovery under the ODbL 1.0 license.
- **Authentic Listings**: Zero data fabrication. If a phone number or email is not present on the listing, it is returned as `undefined`.
- **Optional Apify Google Maps Integration**: Protected by a two-tier cost defense mechanism (atomic per-workspace daily rate limiting + session ceiling). If quota is exceeded, returns HTTP 429 without silent provider substitution.

### Website-Based Prospect Enrichment
- **SSRF-Guarded Web Fetching**: Validates outbound URLs against private IP ranges (`10.0.0.0/8`, `192.168.0.0/16`), loopback addresses, and cloud metadata endpoints (`169.254.169.254`).
- **Bounded Resource Usage**: 7-second abort timeout, 2MB payload ceiling, max 3 redirects.
- **Contact & Social Extraction**: Extracts public `mailto:` links, telephone numbers, and official published links to LinkedIn, Facebook, Instagram, X/Twitter, YouTube, and GitHub.
- **Field-Level Provenance**: Every attribute tracks its origin (`source: "openstreetmap"` vs `source: "website"`) with UI badges.

### Lead Management & CRM
- **Pipeline Stages**: `new`, `contacted`, `qualified`, `converted`, `lost`.
- **Triage & Search**: Priority filtering (`low`, `medium`, `high`), real-time search, and deterministic pagination.
- **Bulk Operations**: Multi-select bulk status updates, bulk archiving, and bulk deletions.
- **CSV Data Mobility**: Full CSV import with automatic column header mapping and RFC 4180 compliant CSV export.

### Reusable Email Templates
- **Template Builder**: Dynamic HTML and plain text email templates.
- **Variable Inspection**: Strictly whitelists allowed template placeholders (`{{firstName}}`, `{{lastName}}`, `{{email}}`, `{{company}}`, `{{phone}}`, `{{source}}`, `{{status}}`, `{{priority}}`). Unknown variables are rejected during creation.

### Outreach Campaigns & Asynchronous Dispatch
- **Cohort Association**: Link cohorts of leads to a campaign via a dedicated `CampaignLead` junction collection with unique constraints.
- **Asynchronous Execution (HTTP 202)**: Campaign launches enqueue individual delivery jobs into Redis/BullMQ and return immediately.
- **Telemetry & Monitoring**: Live tracking of sent, pending, and failed deliveries with sanitized error logs.

### Visual Workflow Automation Engine
- **Visual Graph Editor**: Node-based automation canvas powered by `@xyflow/react`.
- **DAG Topology Validation**: Backend Depth-First Search (DFS) rejects cycles, orphaned nodes, and ensures exactly one trigger exists.
- **Condition Branching**: Evaluates lead fields against operators (`equals`, `not_equals`, `contains`, `not_contains`, `exists`, `not_exists`) routing to `yes` or `no` handles.
- **Automated Actions**: Send personalized emails via SMTP or synchronously update lead attributes in MongoDB.

### Background Queueing & Infrastructure
- **Redis + BullMQ**: Background queues for asynchronous workflow DAG execution (`leadflow-workflows`) and batch email campaign delivery (`leadflow-campaigns`).
- **In-Process Worker Architecture**: In production on Render, BullMQ workers run in-process with the Express API to operate within free-tier resource limits, complete with atomic startup rollback and coordinated graceful shutdown. Standalone worker scripts (`npm run worker:workflow:dev`, `npm run worker:campaign:dev`) remain available for dedicated worker environments.
- **Bounded Retries**: 3 attempts with exponential backoff (`delay: 2000ms`).
- **Delivery Idempotency**: Guarantees that retried jobs never re-send duplicate emails.
- **Resilient Startup**: Express boots cleanly even if Redis or SMTP are temporarily offline.

---

## 3. Technology Stack

| Technology | Purpose |
| :--- | :--- |
| **React + TypeScript** | Frontend UI and type-safe application development |
| **Vite** | Frontend build tooling and local development proxy |
| **Node.js + Express** | Backend REST API server and request routing |
| **MongoDB + Mongoose** | Persistent application data (`leadflow` database) with multi-tenant scoping |
| **Redis + BullMQ** | Background job queues and asynchronous task processing |
| **React Flow (`@xyflow/react`)** | Visual drag-and-drop workflow automation editor |
| **OpenStreetMap + Overpass** | Open geospatial business discovery (Nominatim + Overpass API) |
| **Nodemailer + SMTP** | Email delivery and campaign dispatch |
| **JWT + HTTP-Only Cookies** | Secure stateless authentication without localStorage token exposure |
| **Vercel** | Production frontend hosting with reverse-proxy API rewrites |
| **Render** | Production backend API and in-process background worker hosting |
| **MongoDB Atlas** | Production cloud database cluster |
| **Upstash Redis** | Serverless cloud Redis queue storage |

---

## 4. Architecture Diagram

### System Architecture Flow
```text
Browser Client
  ──► Vercel React Frontend (https://lead-flow-nine-lyart.vercel.app)
  ──► Render Express API Server (https://leadflow-e9m2.onrender.com)
  ──► MongoDB Atlas (`leadflow` database) & Upstash Redis
  ──► In-Process BullMQ Background Workers (Workflow DAG & Campaign Dispatch)
  ──► External Discovery (OSM/Overpass/Apify) / Public Website Enrichment / SMTP Relay
```

> **Worker Deployment Note**: In production on Render, BullMQ workers run in-process with the Express API service to operate efficiently within free-tier limits without requiring separate paid background worker services.

```mermaid
graph TD
    User([Browser Client])
    
    subgraph Frontend [React 18 + Vite]
        UI[CRM, Discovery, Campaigns, Workflow Canvas]
    end

    subgraph Backend [Express API Server]
        Auth[Auth & Workspaces]
        CRM[Lead CRM Service]
        Disc[Discovery & Enrichment]
        Camp[Campaign Service]
        Wf[Workflow Engine]
    end

    subgraph Database [MongoDB]
        Mongo[(Tenants, Leads, Campaigns, Workflows)]
    end

    subgraph Queue [Redis + BullMQ]
        RQueue[leadflow-workflows\nleadflow-campaigns]
    end

    subgraph Workers [Background Workers]
        BWorker[Campaign & Workflow Workers]
    end

    subgraph External [External Services]
        OSM[OpenStreetMap / Overpass]
        Web[Target Websites]
        SMTP[Configured SMTP]
    end

    User <-->|HTTPS / HTTP-Only Cookie| UI
    UI <-->|REST API| Backend
    Backend <-->|Mongoose Queries| Mongo
    Backend -->|Enqueue Jobs| RQueue
    RQueue -->|Dispatch| BWorker
    BWorker <-->|Update State| Mongo
    BWorker -->|Send Emails| SMTP
    Disc -->|Geospatial Queries| OSM
    Disc -->|Public HTML Scraping| Web
```

### ASCII Architecture Representation
```text
  +-------------------------------------------------------------------------+
  |               React 18 + Vite Frontend (Port 5173)                      |
  |     Leads CRM  |  Discovery Engine  |  Campaigns  |  Workflow Canvas   |
  +-------------------------------------------------------------------------+
                                       │
                      HTTPS Requests / HTTP-Only Cookie
                                       ▼
  +-------------------------------------------------------------------------+
  |                   Express API Server (Port 5000)                        |
  |   Auth Controller  |  Lead Service  |  Campaign Service  |  Workflow    |
  +-------------------------------------------------------------------------+
          │                                                  │
   CRUD Operations                                    Enqueue Jobs
          ▼                                                  ▼
  +-----------------------+                          +-----------------------+
  |        MongoDB        |                          |     Redis / BullMQ    |
  |  (Tenants, Leads,     |                          | (leadflow-workflows,  |
  |   Campaigns, Graphs)  |                          |  leadflow-campaigns)  |
  +-----------------------+                          +-----------------------+
          ▲                                                  │
          │                                            Consume Jobs
          │                                                  ▼
          │                          +---------------------------------------+
          └──────────────────────────|         Background Worker Pool        |
                                     |  - Campaign Worker (Async Dispatch)   |
                                     |  - Workflow Worker (DAG Execution)    |
                                     +---------------------------------------+
                                                         │
                                                  Deliver Messages
                                                         ▼
                                            +-------------------------+
                                            |  Configured SMTP Relay  |
                                            +-------------------------+
```

---

## 5. Entity Relationship (ER) Summary

```mermaid
erDiagram
    WORKSPACE ||--o{ USER : contains
    WORKSPACE ||--o{ LEAD : owns
    WORKSPACE ||--o{ EMAIL_TEMPLATE : owns
    WORKSPACE ||--o{ CAMPAIGN : owns
    WORKSPACE ||--o{ CAMPAIGN_LEAD : scopes
    WORKSPACE ||--o{ WORKFLOW : owns
    WORKSPACE ||--o{ WORKFLOW_EXECUTION : scopes
    WORKSPACE ||--o{ WORKSPACE_USAGE : tracks

    EMAIL_TEMPLATE ||--o{ CAMPAIGN : "used by"
    CAMPAIGN ||--o{ CAMPAIGN_LEAD : "targets"
    LEAD ||--o{ CAMPAIGN_LEAD : "enrolled in"
    WORKFLOW ||--o{ WORKFLOW_EXECUTION : "executes"
    LEAD ||--o{ WORKFLOW_EXECUTION : "subject of"
```

### ASCII ER Diagram
```text
  +-------------+       1:N       +-------------+
  |  Workspace  |---------------->|    User     |
  +-------------+                 +-------------+
         │
         │ 1:N
         ├───────────────────────>+-------------+       1:N       +---------------+
         │                        |    Lead     |---------------->| CampaignLead  |
         │                        +-------------+                 +---------------+
         │ 1:N                                                           │
         ├───────────────────────>+---------------+                      │
         │                        | EmailTemplate |                      │
         │                        +---------------+                      │
         │                               │                               │
         │ 1:N                           │ 1:N                           │ N:1
         ├───────────────────────>+---------------+                      │
         │                        |   Campaign    |----------------──────┘
         │                        +---------------+
         │ 1:N
         ├───────────────────────>+---------------+       1:N       +-------------------+
         │                        |   Workflow    |---------------->| WorkflowExecution |
         │                        +---------------+                 +-------------------+
         │ 1:N
         └───────────────────────>+---------------+
                                  |WorkspaceUsage |
                                  +---------------+
```
*For complete schema attributes, constraints, and compound indexes, refer to [`docs/ER_DIAGRAM.md`](./docs/ER_DIAGRAM.md).*

---

## 6. External Services & Cost Considerations

LeadFlow is designed with a **free-first development and deployment approach** using free-tier services where available:
- **Default Real Discovery**: Uses OpenStreetMap Nominatim and public Overpass API instances (open-access under ODbL 1.0).
- **Default Contact Enrichment**: Scrapes and parses public HTML directly from target company websites without commercial enrichment fees.
- **Cloud Infrastructure**: Deployed on free-tier services (Vercel, Render Web Service, MongoDB Atlas M0, Upstash Redis).
- **Email Delivery**: Uses standard SMTP. Can be tested for free using Mailtrap, Gmail SMTP, or local MailHog.
- **Optional Apify Google Maps Integration**: Disabled by default. When enabled, protected by per-workspace daily rate limits (default: 10 runs/day) and concurrency locks to prevent unexpected credit consumption.

### Policy on Paid Third-Party Services
LeadFlow will **never** silently integrate paid third-party services. Prior to introducing any commercial API (e.g. Apollo, ZoomInfo, Google Places, SendGrid Pro):
1. Identify the concrete business requirement.
2. Document why existing open/free approaches are insufficient.
3. Evaluate pricing, quotas, and licensing constraints.
4. Present a formal proposal to stakeholders and obtain explicit approval.

*Distinction*: Public links and contact points discovered from a company's website are distinct from direct platform API access or paid lead databases.

---

## 7. Production Deployment

### Current Production Environment
- **Frontend SPA**: Hosted on [Vercel](https://vercel.com) at [https://lead-flow-nine-lyart.vercel.app](https://lead-flow-nine-lyart.vercel.app) (with `client/vercel.json` proxying `/api/*` to Render).
- **Backend API**: Hosted on [Render](https://render.com) at [https://leadflow-e9m2.onrender.com](https://leadflow-e9m2.onrender.com).
- **Health Telemetry**: [https://leadflow-e9m2.onrender.com/api/health](https://leadflow-e9m2.onrender.com/api/health).
- **Production Database**: [MongoDB Atlas](https://www.mongodb.com/atlas) cluster targeting the `leadflow` database.
- **Queue Storage**: [Upstash Redis](https://upstash.com) serverless cloud Redis.
- **Worker Execution**: Initialized in-process within the Render Express API service after database connection, eliminating the need for a separate paid worker dyno.

### Environment Configuration (`server/.env.example`)
```env
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-leadflow-app.vercel.app
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/leadflow

JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRES_IN=7d

# Optional: SMTP Configuration
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_smtp_user
EMAIL_PASSWORD=your_smtp_password
EMAIL_FROM_NAME="LeadFlow Outreach"
EMAIL_FROM_ADDRESS=outreach@yourdomain.com

# Optional: Redis Configuration (Required for Background Workers)
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=false

# Discovery Provider Configuration
DISCOVERY_PROVIDER=osm_combined
OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
OSM_USER_AGENT="LeadFlow-Discovery-Platform/1.0 (contact@yourdomain.com)"

# Optional: Apify Google Maps Configuration
APIFY_ENABLED=false
APIFY_API_TOKEN=
APIFY_ACTOR_ID=compass/crawler-google-places
APIFY_MAX_RESULTS=20
APIFY_MAX_RUNS_PER_SESSION=5
APIFY_MAX_RUNS_PER_WORKSPACE_PER_DAY=10
```

---

## 8. Local Development

### Prerequisites
- Node.js 20.x or later
- MongoDB running locally on `mongodb://127.0.0.1:27017/leadflow` (or MongoDB Atlas connection string)
- Redis running locally on `127.0.0.1:6379` (optional for web app, required for background queues)

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/anideva/LeadFlow.git
cd LeadFlow

# 2. Setup server environment
cd server
cp .env.example .env
# Edit .env with your local MongoDB URI
cd ..

# 3. Start development servers from root
npm run server:dev   # Starts backend on http://localhost:5000
npm run client:dev   # Starts frontend on http://localhost:5173

# 4. (Optional) Start background workers in server/ directory
cd server
npm run worker:dev   # Starts workflow & campaign worker with hot reload
```

### Verified Endpoints
- **Frontend App**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`
- **Health Check**: `GET http://localhost:5000/api/health`

---

## 9. Testing & QA Verification

LeadFlow enforces strict test coverage with zero mocked real API charges:
- **Apify Discovery Provider Tests**: 16/16 passed (`npm run test:apify`)
- **Discovery V2 Tests (Nominatim + Overpass)**: 15/15 passed (`npm run test:discovery`)
- **Workspace Quota & Cost Protection Tests**: 15/15 passed (`npm run test:apify:usage`)
- **Total Test Suite**: **46/46 Passed (100%)**
- **TypeScript Builds**:
  - `server`: `npm run build` (`tsc`) -> **0 errors**
  - `client`: `npm run build` (`tsc && vite build`) -> **0 errors**

---

## 10. Known Limitations
1. **Render Free Tier Cold Starts**: On Render's free tier, the web service spins down after 15 minutes of zero inbound traffic. Requests after a period of dormancy experience a ~30–45 second cold-start delay while the container boots and reconnects.
2. **External Discovery Rate Limits**: OpenStreetMap and Overpass are shared community resources governed by acceptable use policies and rate limits; queries require polite intervals.
3. **Optional Apify Discovery**: Apify Google Maps is strictly an optional provider requiring an API token; it is not the required or default discovery mechanism.
4. **Email Deliverability**: Outreach delivery depends on the configured external SMTP relay credentials, domain reputation, and provider-specific sending policies.
5. **Static HTML Enrichment**: Website enrichment parses public static HTML; client-rendered JavaScript SPAs without server-side rendering yield minimal contact information.
6. **Contact Forms**: Businesses that omit public emails and provide only web forms cannot have an email extracted via static HTML scraping.
7. **No Direct Social Network Scraping**: LeadFlow intentionally does not scrape authenticated social media platforms (LinkedIn, Instagram) directly.

---

## 11. Future Improvements
*(Labeled as roadmap enhancements)*
- **Additional Discovery Integrations**: Apollo, ZoomInfo, or Google Places API (pending approval).
- **Advanced Lead Scoring**: Automated qualification scoring based on enrichment completeness.
- **Omnichannel Outbound**: Adding SMS (Twilio) and WhatsApp Business API.
- **Inbound Webhooks**: Triggering workflows from external CRM, billing, or form events.

---

## 12. Engineering Highlights (For Manager & Technical Review)
- **Zero-Budget Discovery**: Built a robust geospatial lead discovery engine powered entirely by open data and zero-cost APIs.
- **SSRF Defense Engine**: Custom DNS resolution and IP verification protecting the server against Server-Side Request Forgery and cloud metadata exfiltration.
- **Atomic Quota Protection**: Prevented third-party API budget overruns using atomic MongoDB `$inc` operations with conditional locking, eliminating race conditions under concurrent clicks.
- **Asynchronous Execution**: Decoupled long-running campaigns and workflow graphs into Redis/BullMQ with HTTP 202 responses and idempotent worker retry policies.
- **Strict Multi-Tenancy**: Guaranteed absolute tenant data isolation via database-enforced compound indexes and authenticated JWT cookie sessions.
- **Deterministic Workflow Engine**: Enforced DAG graph topology with cycle detection and maximum traversal boundaries.
