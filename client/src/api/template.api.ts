export interface EmailTemplateItem {
  _id: string;
  name: string;
  subject: string;
  variables: string[];
  isArchived: boolean;
}

export async function fetchEmailTemplates(): Promise<EmailTemplateItem[]> {
  const res = await fetch('/api/email-templates?limit=100', {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch email templates');
  }

  return data.data || [];
}
