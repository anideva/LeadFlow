# LeadFlow — System Architecture & Component Design

This document details the architectural design, component interactions, request pipelines, and operational boundaries of the LeadFlow V1 platform.

---

## 1. High-Level System Architecture

LeadFlow is built as a modular, decoupled full-stack application with asynchronous background processing and strict multi-tenant boundary enforcement.

```mermaid
graph TD
    Client["Browser / Single Page Application\n(React 18 + Vite + TypeScript + @xyflow/react)"]
    
    subgraph CoreBackend ["Express API Server (Node.js + TypeScript)"]
        Router["Express Router & Middlewares\n(CORS, CookieParser, Auth, Validation)"]
        AuthSvc["Auth Service\n(bcryptjs, JWT, HTTP-Only Cookie)"]
        CRMSvc["Lead CRM Service\n(Filtering, Pagination, Bulk Actions, CSV)"]
        DiscSvc["Discovery & Enrichment Service\n(Nominatim, Overpass, Apify, Web Scraping)"]
        CampSvc["Campaign Service\n(Template Engine, Batch Enrollment, Dispatch)"]
        WfSvc["Workflow Engine\n(DAG Validation, React Flow Graph Traversal)"]
    end

    subgraph DataStorage ["Data & Cache Layer"]
        MongoDB[("MongoDB 6.0+\n(Persistent Storage & Compound Indexes)")]
        Redis[("Redis 6.2+\n(BullMQ Queues & Job Coordination)")]
    end

    subgraph Workers ["Dedicated Asynchronous Worker Pool"]
        WfWorker["Workflow Worker\n(Concurrency: 5, Retry: 3 with Exp Backoff)"]
        CampWorker["Campaign Worker\n(Concurrency: 5, Retry: 3 with Exp Backoff)"]
    end

    subgraph ExternalServices ["External Service Boundaries"]
        OSM["OpenStreetMap / Nominatim API\n(Free Real POI Discovery)"]
        Overpass["Overpass API\n(Bounded Tag & Amenity Queries)"]
        Websites["Target Business Websites\n(Public Contact Enrichment)"]
        SMTP["Configured SMTP Provider\n(Transactional Email Delivery)"]
        Apify["Optional: Apify Google Maps\n(Restricted / Quota-Guarded)"]
    end

    Client -->|HTTPS + HTTP-Only Cookie| Router
    Router --> AuthSvc
    Router --> CRMSvc
    Router --> DiscSvc
    Router --> CampSvc
    Router --> WfSvc

    AuthSvc --> MongoDB
    CRMSvc --> MongoDB
    DiscSvc --> MongoDB
    CampSvc --> MongoDB
    WfSvc --> MongoDB

    CampSvc -->|Enqueue Batch Jobs| Redis
    WfSvc -->|Enqueue Execution Jobs| Redis

    Redis --> CampWorker
    Redis --> WfWorker

    CampWorker --> MongoDB
    CampWorker --> SMTP
    WfWorker --> MongoDB
    WfWorker --> SMTP

    DiscSvc --> OSM
    DiscSvc --> Overpass
    DiscSvc --> Websites
    DiscSvc -.->|If Configured & Quota Available| Apify
```

### ASCII High-Level Architecture Diagram
```text
  +-----------------------------------------------------------------------+
  |              React Single Page Application (Vite + TS)                |
  |    (CRM Dashboard, Discovery UI, Template Editor, React Flow Canvas)  |
  +-----------------------------------------------------------------------+
                                      |
                     HTTPS Requests / HTTP-Only JWT Cookie
                                      v
  +-----------------------------------------------------------------------+
  |                   Express API Server (Port 5000)                      |
  |  +--------------------+---------------------+----------------------+  |
  |  |  Auth & Workspaces |   Lead CRM Engine   | Discovery & Enrich   |  |
  |  |  Campaign Manager  |   Workflow Engine   | System Health Check  |  |
  |  +--------------------+---------------------+----------------------+  |
  +-----------------------------------------------------------------------+
              |                                            |
       CRUD Operations                             Job Enqueueing
              v                                            v
  +-----------------------+                    +-----------------------+
  |        MongoDB        |                    |         Redis         |
  |  (Tenants, Leads,     |                    | (leadflow-workflows,  |
  |   Campaigns, Graphs)  |                    |  leadflow-campaigns)  |
  +-----------------------+                    +-----------------------+
              ^                                            |
              |                                     Job Dispatch
              |                                            v
              |               +-------------------------------------------+
              +---------------|          Background Worker Pool           |
                              |  - Workflow Worker (DAG execution, email) |
                              |  - Campaign Worker (batch SMTP dispatch)  |
                              +-------------------------------------------+
                                                           |
                                                   Outbound Delivery
                                                           v
                                              +---------------------------+
                                              | Configured SMTP Provider  |
                                              +---------------------------+
```

---

## 2. Core Request & Data Flows

### 2.1. Authentication & Session Management Flow
LeadFlow enforces enterprise-standard token management via HTTP-only, SameSite cookies. Access tokens are never stored in `localStorage` or exposed to JavaScript.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant Express as Express API (/api/auth)
    participant Mongo as MongoDB (User Collection)

    User->>Browser: Enters email and password
    Browser->>Express: POST /api/auth/login { email, password }
    Express->>Mongo: User.findOne({ email })
    Mongo-->>Express: Returns user record with passwordHash
    Express->>Express: bcrypt.compare(password, passwordHash)
    Express->>Express: jwt.sign({ userId, workspaceId }, JWT_SECRET, { expiresIn: '7d' })
    Express-->>Browser: Set-Cookie: leadflow_token=<jwt>; HttpOnly; SameSite=Lax<br/>HTTP 200 { success: true, user }
    Browser->>User: Renders CRM Dashboard
    Note over Browser, Express: Subsequent requests automatically include the HTTP-only cookie
```

### 2.2. Lead Discovery & Research Flow
LeadFlow provides a decoupled, pluggable discovery architecture supporting both free OpenStreetMap engines and optional, quota-protected third-party providers.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant API as Express API (/api/discovery/search)
    participant Usage as WorkspaceUsageService
    participant Engine as Discovery Engine
    participant OSM as OpenStreetMap / Overpass

    User->>Browser: Enters query ("Bakeries in Jaipur")
    Browser->>API: POST /api/discovery/search { query, provider: "osm_combined" }
    API->>API: Authenticate user & extract workspaceId
    
    alt Provider is Free Discovery (osm_combined)
        API->>Engine: CompositeDiscoveryProvider.search()
        Engine->>OSM: Query Nominatim geocoder & Overpass POI interpreter
        OSM-->>Engine: Raw geospatial nodes & tags
        Engine->>Engine: Normalize & Deduplicate into DiscoveredProspect[]
        Engine-->>API: Returns prospects (real listings, zero fabrication)
    else Provider is Apify Google Maps (Experimental)
        API->>Usage: reserveDailyRun(workspaceId)
        Usage->>Usage: Atomic findOneAndUpdate({ count < 10 }, { $inc: 1 })
        alt Daily limit reached
            Usage-->>API: allowed: false
            API-->>Browser: HTTP 429 APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED
            Browser->>User: Displays Cost Protection banner; keeps provider as Apify
        else Quota available
            Usage-->>API: allowed: true
            API->>Engine: ApifyDiscoveryProvider.search()
            Engine-->>API: Normalized Google Places results
        end
    end

    API-->>Browser: HTTP 200 { success: true, prospects: [...] }
```

### 2.3. Free Website Enrichment Flow (SSRF-Safe)
Inspects a discovered prospect's official website to extract publicly published business contacts without paid APIs.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant API as Express API (/api/discovery/enrich)
    participant Guard as SSRF Guard
    participant Web as Target Business Website

    User->>Browser: Clicks "✨ Enrich" on prospect
    Browser->>API: POST /api/discovery/enrich { prospect }
    API->>Guard: Validate target website URL
    Guard->>Guard: Resolve DNS & check IP against private/loopback/cloud metadata ranges
    alt Target IP is private or invalid
        Guard-->>API: Throws 400 Bad Request
        API-->>Browser: HTTP 400 "Access to local or private networks is forbidden"
    else Target IP is public
        Guard-->>API: URL cleared for fetch
        API->>Web: HTTP GET (Timeout: 7s, Max Size: 2MB, Max Redirects: 3)
        Web-->>API: Raw HTML content
        API->>API: Parse static HTML (no JS execution)
        API->>API: Extract mailto: links, phone patterns, and social media URLs
        API-->>Browser: HTTP 200 { prospect: EnrichedProspect, enrichment: Result }
    end
```

### 2.4. Asynchronous Campaign Dispatch Flow
Outreach campaigns are processed asynchronously via BullMQ queues, providing immediate HTTP 202 responses while background workers dispatch personalized emails.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant API as Express API (/api/campaigns/:id/dispatch)
    participant Redis as BullMQ (leadflow-campaigns)
    participant Worker as Campaign Worker Process
    participant Mongo as MongoDB
    participant SMTP as SMTP Server

    User->>Browser: Clicks "Launch Outreach Campaign"
    Browser->>API: POST /api/campaigns/:id/dispatch
    API->>Mongo: Find pending CampaignLead records
    Mongo-->>API: Returns list of targeted leads
    API->>Redis: enqueueCampaignJobs(leads) with 3-attempt backoff
    API-->>Browser: HTTP 202 Accepted { queued: 50, message: "Campaign dispatch started" }
    
    loop Worker processes each job concurrently
        Redis->>Worker: Dispatch job { campaignId, campaignLeadId, workspaceId }
        Worker->>Mongo: Check CampaignLead status
        alt Already sent (Idempotency check)
            Worker->>Worker: Skip processing (no duplicate email)
        else Pending
            Worker->>Mongo: Resolve EmailTemplate and Lead data
            Worker->>Worker: renderTemplate(subject, body, lead)
            Worker->>SMTP: emailService.sendEmail({ to, subject, html })
            SMTP-->>Worker: Delivery acknowledged
            Worker->>Mongo: Update CampaignLead { status: "sent", sentAt: now() }
        end
    end
    
    Browser->>API: GET /api/campaigns/:id/leads (polls progress)
    API-->>Browser: Returns updated live metrics (e.g. 50 sent, 0 failed)
```

### 2.5. Workflow Automation Engine Flow
Deterministic graph traversal driven by lead lifecycle events (`lead_created`, `lead_updated`, `manual`).

```mermaid
sequenceDiagram
    autonumber
    participant System as CRM / Lead Ingestion
    participant Trigger as WorkflowTriggerService
    participant Queue as BullMQ (leadflow-workflows)
    participant Worker as Workflow Worker Process
    participant Engine as WorkflowExecutionService
    participant Mongo as MongoDB

    System->>Trigger: triggerLeadCreated(workspaceId, lead)
    Trigger->>Mongo: Find active workflows where triggerType == 'lead_created'
    Mongo-->>Trigger: Returns matching workflows
    Trigger->>Mongo: Create WorkflowExecution record (status: 'pending')
    Trigger->>Queue: Enqueue execution job { executionId, workflowId, leadId }
    
    Queue->>Worker: Job received
    Worker->>Engine: executeWorkflow(executionId)
    Engine->>Mongo: Mark execution status: 'running'
    
    loop Graph Traversal (Max 50 steps, Cycle Guarded)
        Engine->>Engine: Evaluate condition node (lead_field comparison)
        alt Branch: YES
            Engine->>Engine: Follow 'yes' edge to action node
        else Branch: NO
            Engine->>Engine: Follow 'no' edge to action node
        end
        alt Action: update_lead
            Engine->>Mongo: Update lead field directly
        else Action: send_email
            Engine->>Engine: Render template & dispatch email via SMTP
        end
        Engine->>Mongo: Append step audit to executionLog
    end
    
    Engine->>Mongo: Mark execution status: 'completed'
```

---

## 3. Component Responsibilities

| Subsystem | Key Technologies | Primary Responsibility |
| :--- | :--- | :--- |
| **Frontend UI** | React 18, Vite, TypeScript, `@xyflow/react` | Single-page application providing the CRM table, natural language discovery search, email template editor, campaign launcher, and visual node-based workflow editor. |
| **API Layer** | Express 4, TypeScript, CookieParser, CORS | Exposes REST endpoints, validates inputs, verifies JWT auth cookies, enforces workspace isolation, and translates internal exceptions into standardized HTTP error responses. |
| **CRM Engine** | Mongoose, MongoDB | Manages leads, custom fields, pipeline statuses, priority triages, soft-deletion (`isArchived`), and multi-tenant compound indexes. |
| **Discovery Engine** | OpenStreetMap Nominatim, Overpass API, Apify | Natural language query parsing, geographic location extraction, bounded POI search, deduplication, and normalized prospect synthesis. |
| **Enrichment Engine** | Node.js `dns`, native `fetch` | Server-Side Request Forgery (SSRF) guarded website scraper extracting emails, phone numbers, and official social media profile links from static HTML. |
| **Queue Manager** | BullMQ 6, Redis 6+ | Asynchronous task queueing, bounded retry management with exponential backoff, job deduplication, and memory retention controls. |
| **Worker Pool** | Standalone Node.js processes | Independent workers executing campaign email dispatches and workflow graph traversals without blocking the Express HTTP thread. |
| **Email Infrastructure** | Nodemailer, SMTP | Abstracted provider layer (`IEmailProvider`) handling variable interpolation, RFC compliance, and secure TLS email transmission. |

---

## 4. Architectural Decisions & Technical Rationale

### 1. Free-First Architecture
- **Decision**: Default discovery and enrichment rely exclusively on open-source, zero-cost services (OpenStreetMap Nominatim under ODbL 1.0, public Overpass API, and native website HTML inspection).
- **Rationale**: Enables zero-budget local testing, developer onboarding without credit card requirements, and zero vendor lock-in.

### 2. Multi-Tenant Workspace Boundary
- **Decision**: Every persistent document (except global user logins) carries a mandatory `workspaceId` field backed by compound indexes (e.g. `{ workspaceId: 1, isArchived: 1, createdAt: -1 }`).
- **Rationale**: Strictly guarantees data isolation between organizations. Controller routes read `workspaceId` solely from verified JWT tokens, preventing IDOR (Insecure Direct Object Reference) vulnerabilities.

### 3. Asynchronous Job Delegation (HTTP 202 Accepted)
- **Decision**: Batch email campaigns and multi-step workflow graphs are queued into Redis/BullMQ and return HTTP 202 immediately to the client.
- **Rationale**: Eliminates HTTP connection timeouts, isolates email gateway latency from user navigation, and allows workers to scale independently of the web tier.

### 4. Deterministic Graph Validation
- **Decision**: React Flow on the frontend is treated purely as a visualization tool; the backend strictly re-validates the entire graph topology on every save.
- **Rationale**: Prevents infinite execution loops via Depth-First Search (DFS) cycle detection, guarantees single-trigger integrity, and enforces strict schema compliance on node parameters.

### 5. Two-Tier Rate Limiting & Cost Protection
- **Decision**: If optional third-party engines (such as Apify) are enabled, they are protected by an atomic MongoDB daily run counter (`WorkspaceUsageService`) backed by an in-memory session ceiling.
- **Rationale**: Eliminates race conditions during concurrent searches and guarantees that no team or workspace can run up unbudgeted third-party cloud costs.
