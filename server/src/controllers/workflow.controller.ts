import { Request, Response } from 'express';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowExecutionService } from '../services/workflow-execution.service';
import { WorkflowTriggerService } from '../services/workflow-trigger.service';
import { WorkflowQueryOptions } from '../validators/workflow.validator';
import { AppError } from '../utils/error.util';

export const createWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const workflow = await WorkflowService.createWorkflow(user.workspaceId, user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Workflow created successfully.',
      data: workflow
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - Create] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create workflow.' });
  }
};

export const getWorkflows = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const options = (req as any).workflowQuery as WorkflowQueryOptions;

    const result = await WorkflowService.listWorkflows(user.workspaceId, options);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - List] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflows.' });
  }
};

export const getWorkflowById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const workflow = await WorkflowService.getWorkflowById(user.workspaceId, req.params.id);

    res.status(200).json({
      success: true,
      data: workflow
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - GetById] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflow.' });
  }
};

export const updateWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const workflow = await WorkflowService.updateWorkflow(
      user.workspaceId,
      req.params.id,
      user.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Workflow updated successfully.',
      data: workflow
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - Update] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update workflow.' });
  }
};

export const archiveWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await WorkflowService.archiveWorkflow(user.workspaceId, req.params.id, user.id);

    res.status(200).json({
      success: true,
      message: 'Workflow archived successfully.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - Archive] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive workflow.' });
  }
};

export const testWorkflowExecution = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { leadId } = req.body;

    const execution = await WorkflowTriggerService.triggerManualWorkflow(
      user.workspaceId,
      req.params.id,
      leadId
    );

    res.status(202).json({
      success: true,
      message: 'Workflow execution queued.',
      data: {
        executionId: execution._id.toString(),
        workflowId: execution.workflowId.toString(),
        leadId: execution.leadId.toString(),
        status: execution.status
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to queue workflow execution.'
    });
  }
};

export const getExecutionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const execution = await WorkflowExecutionService.getExecutionById(
      user.workspaceId,
      req.params.executionId
    );

    res.status(200).json({
      success: true,
      data: execution
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - GetExecutionStatus] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflow execution status.' });
  }
};

export const getWorkflowExecutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { page, limit } = (req as any).executionQuery || { page: 1, limit: 20 };

    const result = await WorkflowExecutionService.listWorkflowExecutions(
      user.workspaceId,
      req.params.id,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Workflow Controller - ListExecutions] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve workflow executions.' });
  }
};
