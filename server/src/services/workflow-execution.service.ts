import { Types } from 'mongoose';
import { Workflow, IWorkflowNode, IWorkflowEdge } from '../models/Workflow.model';
import { Lead, ILead } from '../models/Lead.model';
import {
  WorkflowExecution,
  IWorkflowExecution,
  IWorkflowExecutionStep
} from '../models/WorkflowExecution.model';
import { AppError } from '../utils/error.util';

export interface WorkflowExecutionSummary {
  executionId: string;
  workflowId: string;
  workflowName: string;
  leadId: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  stepsCount: number;
  executionLog: IWorkflowExecutionStep[];
  error?: string;
}

export class WorkflowExecutionService {
  private static readonly MAX_TRAVERSAL_LIMIT = 50;

  /**
   * Evaluates a lead_field condition against the target lead.
   */
  private static evaluateCondition(lead: ILead, conditionData: Record<string, any>): boolean {
    const { field, operator, value } = conditionData;
    const actualRawValue = (lead as any)[field];

    switch (operator) {
      case 'exists':
        return actualRawValue !== undefined && actualRawValue !== null && String(actualRawValue).trim() !== '';

      case 'not_exists':
        return actualRawValue === undefined || actualRawValue === null || String(actualRawValue).trim() === '';

      case 'equals': {
        const actualStr = String(actualRawValue ?? '').trim().toLowerCase();
        const expectedStr = String(value ?? '').trim().toLowerCase();
        return actualStr === expectedStr;
      }

      case 'not_equals': {
        const actualStr = String(actualRawValue ?? '').trim().toLowerCase();
        const expectedStr = String(value ?? '').trim().toLowerCase();
        return actualStr !== expectedStr;
      }

      case 'contains': {
        const actualStr = String(actualRawValue ?? '').toLowerCase();
        const searchStr = String(value ?? '').toLowerCase();
        return actualStr.includes(searchStr);
      }

      case 'not_contains': {
        const actualStr = String(actualRawValue ?? '').toLowerCase();
        const searchStr = String(value ?? '').toLowerCase();
        return !actualStr.includes(searchStr);
      }

      default:
        return false;
    }
  }

  /**
   * Deterministically executes a workflow for a specific lead in a testing context.
   */
  public static async executeTestWorkflow(
    workspaceId: string,
    workflowId: string,
    leadId: string
  ): Promise<WorkflowExecutionSummary> {
    // 1. Verify workflow belongs to workspace, is not archived, and is active
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
        `Cannot test execution: workflow is currently in "${workflow.status}" status. Workflow must be "active" to execute.`
      );
    }

    // 2. Verify lead belongs to workspace and is not archived
    const initialLead = await Lead.findOne({
      _id: new Types.ObjectId(leadId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!initialLead) {
      throw new AppError(404, 'Lead not found in this workspace.');
    }

    let activeLead: ILead = initialLead;
    const startedAt = new Date();
    const executionLog: IWorkflowExecutionStep[] = [];

    // 3. Create WorkflowExecution record
    const execution = await WorkflowExecution.create({
      workspaceId: new Types.ObjectId(workspaceId),
      workflowId: new Types.ObjectId(workflowId),
      triggerType: workflow.triggerType,
      leadId: activeLead._id,
      status: 'running',
      startedAt,
      executionLog: []
    });

    try {
      // Map nodes and edges
      const nodeMap = new Map<string, IWorkflowNode>();
      for (const node of workflow.nodes) {
        nodeMap.set(node.id, node);
      }

      const outgoingEdges = new Map<string, IWorkflowEdge[]>();
      for (const edge of workflow.edges) {
        const list = outgoingEdges.get(edge.source) || [];
        list.push(edge);
        outgoingEdges.set(edge.source, list);
      }

      // 4. Identify trigger node
      const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) {
        throw new AppError(400, 'Workflow is missing a trigger node.');
      }

      executionLog.push({
        nodeId: triggerNode.id,
        nodeType: 'trigger',
        status: 'triggered',
        details: {
          triggerType: workflow.triggerType,
          leadId: activeLead._id.toString()
        },
        timestamp: new Date()
      });

      let currentNode: IWorkflowNode | undefined = triggerNode;
      let stepsCount = 0;
      const visitedNodeIds = new Set<string>();

      // 5. Deterministic Traversal Loop
      while (currentNode) {
        stepsCount++;

        if (stepsCount > this.MAX_TRAVERSAL_LIMIT) {
          throw new AppError(
            400,
            `Workflow execution exceeded maximum traversal limit of ${this.MAX_TRAVERSAL_LIMIT} steps. Execution terminated safely.`
          );
        }

        if (visitedNodeIds.has(currentNode.id)) {
          throw new AppError(
            400,
            `Workflow execution loop detected on node "${currentNode.id}". Execution terminated safely.`
          );
        }

        visitedNodeIds.add(currentNode.id);
        execution.currentNodeId = currentNode.id;

        const outEdges = outgoingEdges.get(currentNode.id) || [];

        if (currentNode.type === 'trigger') {
          if (outEdges.length === 0) {
            // Reached end of workflow
            break;
          }
          const nextNode = nodeMap.get(outEdges[0].target);
          currentNode = nextNode;
        } else if (currentNode.type === 'condition') {
          const conditionResult = this.evaluateCondition(activeLead, currentNode.data || {});
          const branchHandle = conditionResult ? 'yes' : 'no';

          executionLog.push({
            nodeId: currentNode.id,
            nodeType: 'condition',
            status: 'evaluated',
            details: {
              conditionType: currentNode.data?.conditionType,
              field: currentNode.data?.field,
              operator: currentNode.data?.operator,
              expectedValue: currentNode.data?.value,
              actualValue: (activeLead as any)[currentNode.data?.field],
              result: conditionResult,
              branchTaken: branchHandle
            },
            timestamp: new Date()
          });

          // Find the edge corresponding to the branch
          const branchEdge = outEdges.find((e) => e.sourceHandle === branchHandle);
          if (!branchEdge) {
            // Branch has no continuation; workflow terminates safely
            break;
          }

          currentNode = nodeMap.get(branchEdge.target);
        } else if (currentNode.type === 'action') {
          const actionType = currentNode.data?.actionType;

          if (actionType === 'update_lead') {
            const field = currentNode.data?.field;
            const value = currentNode.data?.value;

            // Synchronously update the lead within the authenticated workspace
            const updatedLead: ILead | null = await Lead.findOneAndUpdate(
              {
                _id: activeLead._id,
                workspaceId: new Types.ObjectId(workspaceId),
                isArchived: false
              },
              { $set: { [field]: value } },
              { new: true, runValidators: true }
            );

            if (updatedLead) {
              activeLead = updatedLead;
            }

            executionLog.push({
              nodeId: currentNode.id,
              nodeType: 'action',
              status: 'executed',
              details: {
                actionType: 'update_lead',
                field,
                updatedValue: value
              },
              timestamp: new Date()
            });
          } else if (actionType === 'send_email') {
            // Per Phase 7 specifications: send_email is deferred to Phase 8. Do not send real email.
            executionLog.push({
              nodeId: currentNode.id,
              nodeType: 'action',
              status: 'deferred_phase_8',
              details: {
                actionType: 'send_email',
                templateId: currentNode.data?.templateId,
                recipient: activeLead.email,
                notice: 'Email action recognized and deferred to Phase 8 background queue'
              },
              timestamp: new Date()
            });
          }

          if (outEdges.length === 0) {
            // Reached terminal action
            break;
          }

          currentNode = nodeMap.get(outEdges[0].target);
        } else {
          break;
        }
      }

      // 6. Complete Execution
      const completedAt = new Date();
      execution.status = 'completed';
      execution.completedAt = completedAt;
      execution.executionLog = executionLog;
      await execution.save();

      return {
        executionId: execution._id.toString(),
        workflowId: workflow._id.toString(),
        workflowName: workflow.name,
        leadId: activeLead._id.toString(),
        status: 'completed',
        startedAt,
        completedAt,
        stepsCount: executionLog.length,
        executionLog
      };
    } catch (err: any) {
      const completedAt = new Date();
      execution.status = 'failed';
      execution.completedAt = completedAt;
      execution.error = err.message || 'Execution error occurred.';
      execution.executionLog = executionLog;
      await execution.save();

      throw err;
    }
  }
}
