export type CampaignStatus = 'draft' | 'active' | 'completed' | 'paused';
export type CampaignLeadStatus = 'pending' | 'sent' | 'failed';

export interface CampaignItem {
  _id: string;
  name: string;
  description?: string;
  templateId:
    | {
        _id: string;
        name: string;
        subject: string;
      }
    | string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStats {
  totalLeads: number;
  pending: number;
  sent: number;
  failed: number;
}

export interface CampaignLeadItem {
  _id: string;
  campaignId: string;
  leadId: {
    _id: string;
    firstName: string;
    lastName?: string;
    email?: string;
    company?: string;
    phone?: string;
    status?: string;
  };
  status: CampaignLeadStatus;
  addedAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
}

export interface CampaignPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GetCampaignsQuery {
  page?: number;
  limit?: number;
  status?: CampaignStatus | '';
  search?: string;
  query?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface GetCampaignsResponse {
  success: boolean;
  data: CampaignItem[];
  pagination: CampaignPagination;
}

export interface CreateCampaignDTO {
  name: string;
  templateId: string;
  description?: string;
}

export interface UpdateCampaignDTO {
  name?: string;
  templateId?: string;
  description?: string;
  status?: CampaignStatus;
}

export interface AssociateLeadsResult {
  added: number;
  alreadyAssociated: number;
  invalid: number;
}

export interface GetCampaignLeadsQuery {
  page?: number;
  limit?: number;
  status?: CampaignLeadStatus | '';
}

export interface GetCampaignLeadsResponse {
  success: boolean;
  data: CampaignLeadItem[];
  pagination: CampaignPagination;
}

export interface SendCampaignResult {
  campaignId: string;
  queued: number;
}

/**
 * Lists campaigns for the current authenticated user's workspace with server-side
 * pagination, search, sorting, and status filter.
 */
export async function getCampaigns(params?: GetCampaignsQuery): Promise<GetCampaignsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);
  const searchVal = params?.search !== undefined ? params.search : params?.query;
  if (searchVal && searchVal.trim()) searchParams.set('search', searchVal.trim());
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const queryStr = searchParams.toString();
  const url = `/api/campaigns${queryStr ? `?${queryStr}` : ''}`;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch campaigns');
  }

  return {
    success: json.success,
    data: json.data || [],
    pagination: json.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 }
  };
}

/**
 * Retrieves a single campaign by ID with populated email template details.
 */
export async function getCampaignById(id: string): Promise<CampaignItem> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch campaign');
  }

  return json.data;
}

/**
 * Creates a new campaign associated with an existing email template.
 */
export async function createCampaign(payload: CreateCampaignDTO): Promise<CampaignItem> {
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to create campaign');
  }

  return json.data;
}

/**
 * Updates an existing campaign's metadata, referenced template, or status.
 */
export async function updateCampaign(
  id: string,
  payload: UpdateCampaignDTO
): Promise<CampaignItem> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to update campaign');
  }

  return json.data;
}

/**
 * Soft-archives / deletes a campaign.
 */
export async function archiveCampaign(
  id: string
): Promise<{ id: string; isArchived: boolean }> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to archive campaign');
  }

  return json.data;
}

/**
 * Associates CRM leads with a campaign.
 * Handles duplicate associations, foreign leads, and archived leads gracefully.
 */
export async function associateLeadsToCampaign(
  id: string,
  leadIds: string[]
): Promise<AssociateLeadsResult> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ leadIds })
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to associate leads to campaign');
  }

  return json.data;
}

/**
 * Retrieves leads associated with a campaign with server-side pagination and status filter.
 */
export async function getCampaignLeads(
  id: string,
  params?: GetCampaignLeadsQuery
): Promise<GetCampaignLeadsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const queryStr = searchParams.toString();
  const url = `/api/campaigns/${encodeURIComponent(id)}/leads${queryStr ? `?${queryStr}` : ''}`;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch campaign leads');
  }

  return {
    success: json.success,
    data: json.data || [],
    pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 }
  };
}

/**
 * Removes a lead association from a campaign.
 * Note: Does not delete or archive the underlying CRM lead record.
 */
export async function removeLeadFromCampaign(
  id: string,
  leadId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(
    `/api/campaigns/${encodeURIComponent(id)}/leads/${encodeURIComponent(leadId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }
  );

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to remove lead from campaign');
  }

  return {
    success: json.success,
    message: json.message || 'Lead removed from campaign successfully.'
  };
}

/**
 * Retrieves aggregated statistics for a campaign (total, pending, sent, failed).
 */
export async function getCampaignStats(id: string): Promise<CampaignStats> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/stats`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to fetch campaign statistics');
  }

  return json.data;
}

/**
 * Dispatches a campaign for background delivery via BullMQ.
 * Note: Returns HTTP 202 when jobs are successfully queued.
 */
export async function sendCampaign(id: string): Promise<SendCampaignResult> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const json = await res.json();
  if (!res.ok) {
    const error: any = new Error(json.error || 'Failed to dispatch campaign');
    error.status = res.status;
    throw error;
  }

  return json.data;
}

// Export aliases for consistency with fetch* naming convention
export const fetchCampaigns = getCampaigns;
export const fetchCampaignById = getCampaignById;
export const fetchCampaignLeads = getCampaignLeads;
export const fetchCampaignStats = getCampaignStats;
