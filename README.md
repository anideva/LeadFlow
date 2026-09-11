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
