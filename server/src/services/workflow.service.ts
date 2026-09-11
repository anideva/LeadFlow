import { Types } from 'mongoose';
import {
  Workflow,
  IWorkflow,
  IWorkflowNode,
  IWorkflowEdge,
  WorkflowStatus,
  WorkflowTriggerType
} from '../models/Workflow.model';
import { WorkflowGraphValidator } from '../utils/workflow-validator.util';
import { AppError } from '../utils/error.util';
import { WorkflowQueryOptions } from '../validators/workflow.validator';

export interface CreateWorkflowDTO {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
}

export interface UpdateWorkflowDTO {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  triggerType?: WorkflowTriggerType;
  nodes?: IWorkflowNode[];
  edges?: IWorkflowEdge[];
}

export interface PaginatedWorkflowsResult {
  data: IWorkflow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class WorkflowService {
  /**
   * Creates a new workflow with full server-side graph validation.
   */
  public static async createWorkflow(
    workspaceId: string,
    userId: string,
    dto: CreateWorkflowDTO
  ): Promise<IWorkflow> {
    // Run complete server-side graph validation before creating
    await WorkflowGraphValidator.validateGraph(workspaceId, {
      triggerType: dto.triggerType,
      nodes: dto.nodes,
      edges: dto.edges
    });

    const workflow = await Workflow.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: dto.name,
      description: dto.description,
      status: dto.status || 'draft',
      triggerType: dto.triggerType,
      nodes: dto.nodes,
      edges: dto.edges,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      isArchived: false
    });

    return workflow;
  }

  /**
   * Lists workflows for a workspace with pagination, filters, and search.
   * Archived workflows are strictly excluded.
   */
  public static async listWorkflows(
    workspaceId: string,
    options: WorkflowQueryOptions
  ): Promise<PaginatedWorkflowsResult> {
    const { page, limit, search, status, triggerType, sortBy, sortOrder } = options;

    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    };

    if (status) {
      filter.status = status;
    }

    if (triggerType) {
      filter.triggerType = triggerType;
    }

    if (search && search.trim().length > 0) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObject: Record<string, 1 | -1> = {
      [sortBy]: sortDirection,
      _id: sortDirection
    };

    const skip = (page - 1) * limit;

    const [total, workflows] = await Promise.all([
      Workflow.countDocuments(filter),
      Workflow.find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: workflows as unknown as IWorkflow[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Retrieves a single workflow by ID, enforcing workspace isolation.
   */
  public static async getWorkflowById(
    workspaceId: string,
    workflowId: string
  ): Promise<IWorkflow> {
    const workflow = await Workflow.findOne({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!workflow) {
      throw new AppError(404, 'Workflow not found in this workspace.');
    }

    return workflow as unknown as IWorkflow;
  }

  /**
   * Updates an existing workflow. If graph structure changes or status transitions to active,
   * full graph validation is re-executed.
   */
  public static async updateWorkflow(
    workspaceId: string,
    workflowId: string,
    userId: string,
    dto: UpdateWorkflowDTO
  ): Promise<IWorkflow> {
    const workflow = await Workflow.findOne({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!workflow) {
      throw new AppError(404, 'Workflow not found in this workspace.');
    }

    const newTriggerType = dto.triggerType !== undefined ? dto.triggerType : workflow.triggerType;
    const newNodes = dto.nodes !== undefined ? dto.nodes : workflow.nodes;
    const newEdges = dto.edges !== undefined ? dto.edges : workflow.edges;
    const newStatus = dto.status !== undefined ? dto.status : workflow.status;

    const graphChanged =
      dto.nodes !== undefined || dto.edges !== undefined || dto.triggerType !== undefined;
    const activating = newStatus === 'active' && workflow.status !== 'active';

    // If graph changed OR workflow is being activated, run full graph validation
    if (graphChanged || activating || newStatus === 'active') {
      await WorkflowGraphValidator.validateGraph(workspaceId, {
        triggerType: newTriggerType,
        nodes: newNodes,
        edges: newEdges
      });
    }

    if (dto.name !== undefined) workflow.name = dto.name;
    if (dto.description !== undefined) workflow.description = dto.description;
    workflow.status = newStatus;
    workflow.triggerType = newTriggerType;
    if (dto.nodes !== undefined) workflow.nodes = dto.nodes;
    if (dto.edges !== undefined) workflow.edges = dto.edges;
    workflow.updatedBy = new Types.ObjectId(userId);

    await workflow.save();
    return workflow;
  }

  /**
   * Soft-archives a workflow by setting isArchived: true.
   * Enforces workspace isolation.
   */
  public static async archiveWorkflow(
    workspaceId: string,
    workflowId: string,
    userId: string
  ): Promise<{ id: string; isArchived: boolean }> {
    const archived = await Workflow.findOneAndUpdate(
      {
        _id: new Types.ObjectId(workflowId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      {
        $set: {
          isArchived: true,
          status: 'paused',
          updatedBy: new Types.ObjectId(userId)
        }
      },
      { new: true }
    ).lean();

    if (!archived) {
      throw new AppError(404, 'Workflow not found in this workspace.');
    }

    return {
      id: archived._id.toString(),
      isArchived: true
    };
  }
}
