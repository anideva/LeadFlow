import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  WORKFLOW_STATUS_VALUES,
  WORKFLOW_TRIGGER_VALUES,
  WorkflowStatus,
  WorkflowTriggerType
} from '../models/Workflow.model';

const PROTECTED_FIELDS = ['_id', 'workspaceId', 'createdBy', 'isArchived', 'createdAt', 'updatedAt'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'status', 'triggerType'];

export interface WorkflowQueryOptions {
  page: number;
  limit: number;
  search?: string;
  status?: WorkflowStatus;
  triggerType?: WorkflowTriggerType;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * Validates workflow ID param format.
 */
export const validateWorkflowObjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid workflow ID format.'
    });
    return;
  }

  next();
};

/**
 * Validates body for POST /api/workflows.
 */
export const validateCreateWorkflow = (req: Request, res: Response, next: NextFunction): void => {
  // Reject protected fields
  for (const field of PROTECTED_FIELDS) {
    if (req.body && field in req.body) {
      res.status(400).json({
        success: false,
        error: `Field "${field}" cannot be provided when creating a workflow.`
      });
      return;
    }
  }

  const { name, description, status, triggerType, nodes, edges } = req.body || {};

  // 1. Name validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Workflow name is required.'
    });
    return;
  }
  if (name.trim().length > 150) {
    res.status(400).json({
      success: false,
      error: 'Workflow name cannot exceed 150 characters.'
    });
    return;
  }

  // 2. Description validation
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Description must be a string.'
      });
      return;
    }
    if (description.trim().length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Description cannot exceed 1000 characters.'
      });
      return;
    }
  }

  // 3. Status validation
  if (status !== undefined) {
    if (!WORKFLOW_STATUS_VALUES.includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid workflow status: "${status}". Allowed: ${WORKFLOW_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  // 4. TriggerType validation
  if (!triggerType || !WORKFLOW_TRIGGER_VALUES.includes(triggerType)) {
    res.status(400).json({
      success: false,
      error: `Invalid workflow triggerType: "${triggerType}". Allowed: ${WORKFLOW_TRIGGER_VALUES.join(', ')}.`
    });
    return;
  }

  // 5. Nodes and Edges arrays
  if (!Array.isArray(nodes)) {
    res.status(400).json({
      success: false,
      error: 'Workflow nodes must be an array.'
    });
    return;
  }

  if (!Array.isArray(edges)) {
    res.status(400).json({
      success: false,
      error: 'Workflow edges must be an array.'
    });
    return;
  }

  req.body = {
    name: name.trim(),
    description: description ? description.trim() : undefined,
    status: status || 'draft',
    triggerType,
    nodes,
    edges
  };

  next();
};

/**
 * Validates body for PATCH /api/workflows/:id.
 */
export const validateUpdateWorkflow = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one field must be provided for update.'
    });
    return;
  }

  // Reject protected fields
  for (const field of PROTECTED_FIELDS) {
    if (field in req.body) {
      res.status(400).json({
        success: false,
        error: `Field "${field}" cannot be modified directly.`
      });
      return;
    }
  }

  const { name, description, status, triggerType, nodes, edges } = req.body;
  const sanitizedUpdate: Record<string, any> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Workflow name cannot be empty.' });
      return;
    }
    if (name.trim().length > 150) {
      res.status(400).json({ success: false, error: 'Workflow name cannot exceed 150 characters.' });
      return;
    }
    sanitizedUpdate.name = name.trim();
  }

  if (description !== undefined) {
    if (description === null || description === '') {
      sanitizedUpdate.description = undefined;
    } else {
      if (typeof description !== 'string') {
        res.status(400).json({ success: false, error: 'Description must be a string.' });
        return;
      }
      if (description.trim().length > 1000) {
        res.status(400).json({ success: false, error: 'Description cannot exceed 1000 characters.' });
        return;
      }
      sanitizedUpdate.description = description.trim();
    }
  }

  if (status !== undefined) {
    if (!WORKFLOW_STATUS_VALUES.includes(status)) {
      res.status(400).json({
        success: false,
        error: `Invalid workflow status: "${status}". Allowed: ${WORKFLOW_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
    sanitizedUpdate.status = status;
  }

  if (triggerType !== undefined) {
    if (!WORKFLOW_TRIGGER_VALUES.includes(triggerType)) {
      res.status(400).json({
        success: false,
        error: `Invalid workflow triggerType: "${triggerType}". Allowed: ${WORKFLOW_TRIGGER_VALUES.join(', ')}.`
      });
      return;
    }
    sanitizedUpdate.triggerType = triggerType;
  }

  if (nodes !== undefined) {
    if (!Array.isArray(nodes)) {
      res.status(400).json({ success: false, error: 'Workflow nodes must be an array.' });
      return;
    }
    sanitizedUpdate.nodes = nodes;
  }

  if (edges !== undefined) {
    if (!Array.isArray(edges)) {
      res.status(400).json({ success: false, error: 'Workflow edges must be an array.' });
      return;
    }
    sanitizedUpdate.edges = edges;
  }

  if (Object.keys(sanitizedUpdate).length === 0) {
    res.status(400).json({
      success: false,
      error: 'No valid fields provided for update.'
    });
    return;
  }

  req.body = sanitizedUpdate;
  next();
};

/**
 * Validates query params for GET /api/workflows.
 */
export const validateWorkflowQuery = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit, search, status, triggerType, sortBy, sortOrder } = req.query;

  let parsedPage = 1;
  if (page !== undefined) {
    parsedPage = parseInt(page as string, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "page" must be a positive integer.'
      });
      return;
    }
  }

  let parsedLimit = 20;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "limit" must be between 1 and 100.'
      });
      return;
    }
  }

  if (status !== undefined) {
    if (!WORKFLOW_STATUS_VALUES.includes(status as WorkflowStatus)) {
      res.status(400).json({
        success: false,
        error: `Invalid status filter: "${status}". Allowed: ${WORKFLOW_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  if (triggerType !== undefined) {
    if (!WORKFLOW_TRIGGER_VALUES.includes(triggerType as WorkflowTriggerType)) {
      res.status(400).json({
        success: false,
        error: `Invalid triggerType filter: "${triggerType}". Allowed: ${WORKFLOW_TRIGGER_VALUES.join(', ')}.`
      });
      return;
    }
  }

  const chosenSortBy = sortBy ? (sortBy as string) : 'createdAt';
  if (!ALLOWED_SORT_FIELDS.includes(chosenSortBy)) {
    res.status(400).json({
      success: false,
      error: `sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}.`
    });
    return;
  }

  const chosenSortOrder = sortOrder ? (sortOrder as string).toLowerCase() : 'desc';
  if (chosenSortOrder !== 'asc' && chosenSortOrder !== 'desc') {
    res.status(400).json({
      success: false,
      error: 'sortOrder must be either "asc" or "desc".'
    });
    return;
  }

  (req as any).workflowQuery = {
    page: parsedPage,
    limit: parsedLimit,
    search: typeof search === 'string' && search.trim().length > 0 ? search.trim() : undefined,
    status: status as WorkflowStatus | undefined,
    triggerType: triggerType as WorkflowTriggerType | undefined,
    sortBy: chosenSortBy,
    sortOrder: chosenSortOrder as 'asc' | 'desc'
  };

  next();
};

/**
 * Validates body for POST /api/workflows/:id/test.
 */
export const validateTestWorkflow = (req: Request, res: Response, next: NextFunction): void => {
  const { leadId } = req.body || {};

  if (!leadId || typeof leadId !== 'string' || !Types.ObjectId.isValid(leadId)) {
    res.status(400).json({
      success: false,
      error: 'A valid leadId is required to test workflow execution.'
    });
    return;
  }

  next();
};

/**
 * Validates executionId param format for GET /api/workflows/executions/:executionId.
 */
export const validateExecutionObjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { executionId } = req.params;

  if (!executionId || !Types.ObjectId.isValid(executionId)) {
    res.status(400).json({
      success: false,
      error: 'Invalid execution ID format.'
    });
    return;
  }

  next();
};

/**
 * Validates pagination query parameters for GET /api/workflows/:id/executions.
 */
export const validateExecutionQuery = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit } = req.query;

  let parsedPage = 1;
  if (page !== undefined) {
    parsedPage = parseInt(page as string, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "page" must be a positive integer.'
      });
      return;
    }
  }

  let parsedLimit = 20;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "limit" must be between 1 and 100.'
      });
      return;
    }
  }

  (req as any).executionQuery = {
    page: parsedPage,
    limit: parsedLimit
  };

  next();
};
