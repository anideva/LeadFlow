export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateItem {
  _id: string;
  name: string;
  subject: string;
  variables: string[];
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEmailTemplateDTO {
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface UpdateEmailTemplateDTO {
  name?: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
}

/**
 * Supported variable tokens in LeadFlow templates.
 */
export const SUPPORTED_TEMPLATE_VARIABLES = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
] as const;

export type SupportedTemplateVariable = (typeof SUPPORTED_TEMPLATE_VARIABLES)[number];

/**
 * Fetches all active email templates for the workspace.
 */
export async function fetchEmailTemplates(search?: string): Promise<EmailTemplate[]> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');
  if (search && search.trim()) {
    params.set('search', search.trim());
  }

  const res = await fetch(`/api/email-templates?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch email templates');
  }

  return json.data || [];
}

/**
 * Retrieves a single email template by ID.
 */
export async function getEmailTemplate(id: string): Promise<EmailTemplate> {
  const res = await fetch(`/api/email-templates/${encodeURIComponent(id)}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch email template');
  }

  return json.data;
}

/**
 * Creates a new email template in the authenticated workspace.
 */
export async function createEmailTemplate(dto: CreateEmailTemplateDTO): Promise<EmailTemplate> {
  const res = await fetch('/api/email-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(dto)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to create email template');
  }

  return json.data;
}

/**
 * Updates an existing email template.
 */
export async function updateEmailTemplate(
  id: string,
  dto: UpdateEmailTemplateDTO
): Promise<EmailTemplate> {
  const res = await fetch(`/api/email-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(dto)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to update email template');
  }

  return json.data;
}

/**
 * Soft-archives / deletes an email template.
 */
export async function archiveEmailTemplate(
  id: string
): Promise<{ id: string; isArchived: boolean }> {
  const res = await fetch(`/api/email-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to delete email template');
  }

  return json.data;
}
