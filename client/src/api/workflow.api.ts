export type WorkflowStatus = 'draft' | 'active' | 'paused';
export type WorkflowTriggerType = 'lead_created' | 'lead_updated' | 'manual';
export type WorkflowNodeType = 'trigger' | 'condition' | 'action';
export type WorkflowActionType = 'send_email' | 'update_lead';
export type WorkflowConditionType = 'lead_field';
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists';

export interface IWorkflowNodePosition {
  x: number;
  y: number;
}

export interface IWorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: IWorkflowNodePosition;
  data: Record<string, any>;
}

export interface IWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface IWorkflow {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  createdBy: string;
  updatedBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionStep {
  nodeId: string;
  nodeType: string;
  status: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface WorkflowExecutionSummary {
  executionId: string;
  workflowId: string;
  workflowName: string;
  leadId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  stepsCount: number;
  executionLog: WorkflowExecutionStep[];
  error?: string;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  triggerType?: WorkflowTriggerType;
  nodes?: IWorkflowNode[];
  edges?: IWorkflowEdge[];
}

export async function fetchWorkflows(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  triggerType?: string;
}): Promise<{ data: IWorkflow[]; pagination: any }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.triggerType) query.set('triggerType', params.triggerType);

  const res = await fetch(`/api/workflows?${query.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch workflows');
  }

  return data;
}

export async function fetchWorkflowById(id: string): Promise<IWorkflow> {
  const res = await fetch(`/api/workflows/${id}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch workflow');
  }

  return data.data;
}

export async function createWorkflow(payload: CreateWorkflowPayload): Promise<IWorkflow> {
  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create workflow');
  }

  return data.data;
}

export async function updateWorkflow(
  id: string,
  payload: UpdateWorkflowPayload
): Promise<IWorkflow> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update workflow');
  }

  return data.data;
}

export async function archiveWorkflow(id: string): Promise<void> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to archive workflow');
  }
}

export async function testWorkflow(
  id: string,
  leadId: string
): Promise<WorkflowExecutionSummary> {
  const res = await fetch(`/api/workflows/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ leadId })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to test workflow execution');
  }

  return data.data;
}
