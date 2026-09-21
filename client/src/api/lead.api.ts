export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
export type LeadPriority = 'low' | 'medium' | 'high';

export interface Lead {
  _id: string;
  workspaceId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status: LeadStatus;
  priority: LeadPriority;
  notes?: string;
  createdBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GetLeadsResponse {
  success: boolean;
  data: Lead[];
  pagination: LeadPagination;
}

export interface LeadQueryFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus | '';
  priority?: LeadPriority | '';
  source?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateLeadPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  notes?: string;
}

/**
 * Lists leads for the current authenticated user's workspace with server-side
 * pagination, multi-field search, and status/priority filters.
 */
export async function getLeads(filter: LeadQueryFilter = {}): Promise<GetLeadsResponse> {
  const params = new URLSearchParams();

  if (filter.page !== undefined && filter.page > 0) {
    params.set('page', String(filter.page));
  }
  if (filter.limit !== undefined && filter.limit > 0) {
    params.set('limit', String(filter.limit));
  }
  if (filter.search && filter.search.trim()) {
    params.set('search', filter.search.trim());
  }
  if (filter.status && filter.status.trim()) {
    params.set('status', filter.status.trim());
  }
  if (filter.priority && filter.priority.trim()) {
    params.set('priority', filter.priority.trim());
  }
  if (filter.source && filter.source.trim()) {
    params.set('source', filter.source.trim());
  }
  if (filter.sortBy) {
    params.set('sortBy', filter.sortBy);
  }
  if (filter.sortOrder) {
    params.set('sortOrder', filter.sortOrder);
  }

  const queryString = params.toString();
  const url = queryString ? `/api/leads?${queryString}` : '/api/leads';

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to retrieve leads');
  }

  return {
    success: data.success,
    data: data.data || [],
    pagination: data.pagination || {
      page: filter.page || 1,
      limit: filter.limit || 10,
      total: data.data?.length || 0,
      totalPages: 1
    }
  };
}

/**
 * Retrieves a single lead by its ID within the user's workspace.
 */
export async function getLeadById(id: string): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to retrieve lead details');
  }

  return data.data;
}

/**
 * Updates editable fields of a lead by ID within the user's workspace.
 */
export async function updateLead(id: string, payload: UpdateLeadPayload): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update lead');
  }

  return data.data;
}

/**
 * Soft-archives a lead by ID within the user's workspace.
 */
export async function archiveLead(id: string): Promise<{ id: string; isArchived: boolean }> {
  const res = await fetch(`/api/leads/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to archive lead');
  }

  return data.data;
}
