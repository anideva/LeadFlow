import { Types } from 'mongoose';
import { Workflow, IWorkflow } from '../models/Workflow.model';
import { Lead, ILead } from '../models/Lead.model';
import { WorkflowExecution, IWorkflowExecution } from '../models/WorkflowExecution.model';
import { enqueueWorkflowJob } from '../queues/workflow.queue';
import { AppError } from '../utils/error.util';

export class WorkflowTriggerService {
  /**
   * Evaluates and enqueues workflows listening to 'lead_created' event in a workspace.
   * Runs non-blocking to avoid interrupting lead creation if queue is temporarily offline.
   */
  public static async triggerLeadCreated(
    workspaceId: string,
    lead: ILead
  ): Promise<string[]> {
    const matchingWorkflows = await Workflow.find({
      workspaceId: new Types.ObjectId(workspaceId),
      triggerType: 'lead_created',
      status: 'active',
      isArchived: false
    }).lean();

    if (matchingWorkflows.length === 0) {
      return [];
    }

    const enqueuedExecutionIds: string[] = [];

    for (const workflow of matchingWorkflows) {
      // Create initial pending execution record
      const execution = await WorkflowExecution.create({
        workspaceId: new Types.ObjectId(workspaceId),
        workflowId: workflow._id,
        triggerType: 'lead_created',
        leadId: lead._id,
        status: 'pending',
        executionLog: []
      });

      try {
        await enqueueWorkflowJob({
          workflowId: workflow._id.toString(),
          leadId: lead._id.toString(),
          workspaceId,
          triggerType: 'lead_created',
          executionId: execution._id.toString()
        });
        enqueuedExecutionIds.push(execution._id.toString());
      } catch (queueErr: any) {
        // Mark execution failed safely if queueing fails
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.error = `Queue delivery failed: ${queueErr.message}`;
        await execution.save();
        console.warn(`[WorkflowTriggerService] Failed to enqueue workflow ${workflow._id}:`, queueErr.message);
      }
    }

    return enqueuedExecutionIds;
  }

  /**
   * Enqueues a manual test workflow execution.
   */
  public static async triggerManualWorkflow(
    workspaceId: string,
    workflowId: string,
    leadId: string
  ): Promise<IWorkflowExecution> {
    // 1. Verify workflow belongs to workspace, is active, not archived
    const workflow = await Workflow.findOne({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!workflow) {
      throw new AppError(404, 'Workflow not found in this workspace.');
    }

    if (workflow.status !== 'active') {
      throw new AppError(
        400,
        `Cannot execute workflow: status is "${workflow.status}". Workflow must be "active" to execute.`
      );
    }

    // 2. Verify lead belongs to workspace and is not archived
    const lead = await Lead.findOne({
      _id: new Types.ObjectId(leadId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!lead) {
      throw new AppError(404, 'Lead not found in this workspace.');
    }

    // 3. Create execution in pending status
    const execution = await WorkflowExecution.create({
      workspaceId: new Types.ObjectId(workspaceId),
      workflowId: workflow._id,
      triggerType: 'manual',
      leadId: lead._id,
      status: 'pending',
      executionLog: []
    });

    // 4. Enqueue background job
    try {
      await enqueueWorkflowJob({
        workflowId: workflow._id.toString(),
        leadId: lead._id.toString(),
        workspaceId,
        triggerType: 'manual',
        executionId: execution._id.toString()
      });
      return execution;
    } catch (err: any) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = `Queue delivery failed: ${err.message}`;
      await execution.save();
      throw err;
    }
  }
}
