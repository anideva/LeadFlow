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

export type BulkLeadAction = 'update_status' | 'update_priority' | 'archive';

export interface BulkLeadPayload {
  leadIds: string[];
  action: BulkLeadAction;
  status?: LeadStatus;
  priority?: LeadPriority;
}

export interface BulkLeadResult {
  operation: BulkLeadAction;
  targetedCount: number;
  matchedCount: number;
  modifiedCount: number;
}

export interface BulkLeadResponse {
  success: boolean;
  message: string;
  data: BulkLeadResult;
}

export interface LeadExportOptions {
  leadIds?: string[];
  search?: string;
  status?: LeadStatus | '';
  priority?: LeadPriority | '';
  source?: string;
}

/**
 * Executes a bulk operation (status update, priority update, or archive)
 * across multiple leads within the user's workspace.
 */
export async function bulkLeadOperation(payload: BulkLeadPayload): Promise<BulkLeadResponse> {
  const res = await fetch('/api/leads/bulk', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to process bulk operation');
  }

  return data;
}

/**
 * Requests a CSV export of leads (either specific selected IDs or filtered results)
 * and triggers a native browser download with the server-provided filename.
 */
export async function downloadLeadsCsv(options: LeadExportOptions = {}): Promise<{ filename: string; blob: Blob }> {
  const params = new URLSearchParams();

  if (options.leadIds && options.leadIds.length > 0) {
    params.set('leadIds', options.leadIds.join(','));
  } else {
    if (options.search && options.search.trim()) {
      params.set('search', options.search.trim());
    }
    if (options.status && options.status.trim()) {
      params.set('status', options.status.trim());
    }
    if (options.priority && options.priority.trim()) {
      params.set('priority', options.priority.trim());
    }
    if (options.source && options.source.trim()) {
      params.set('source', options.source.trim());
    }
  }

  const queryString = params.toString();
  const url = queryString ? `/api/leads/export?${queryString}` : '/api/leads/export';

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include'
  });

  if (!res.ok) {
    let errorMsg = 'Failed to export CSV';
    try {
      const errJson = await res.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // not json
    }
    throw new Error(errorMsg);
  }

  let filename = 'leadflow-leads.csv';
  const disposition = res.headers.get('Content-Disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();

  // Create temporary object URL and trigger browser download
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objectUrl);

  return { filename, blob };
}

