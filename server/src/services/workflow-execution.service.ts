import { Types } from 'mongoose';
import { Workflow, IWorkflowNode, IWorkflowEdge } from '../models/Workflow.model';
import { Lead, ILead } from '../models/Lead.model';
import { EmailTemplate } from '../models/EmailTemplate.model';
import {
  WorkflowExecution,
  IWorkflowExecution,
  IWorkflowExecutionStep
} from '../models/WorkflowExecution.model';
import { EmailService } from './email/email.service';
import { renderTemplate } from '../utils/template-renderer.util';
import { AppError } from '../utils/error.util';
import { WorkflowJobData } from '../queues/workflow.queue';

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
  private static emailServiceInstance: EmailService = new EmailService();

  public static setEmailService(service: EmailService): void {
    this.emailServiceInstance = service;
  }

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
   * Main entrypoint for background worker to execute a queued workflow job idempotently.
   */
  public static async executeWorkflowJob(jobData: WorkflowJobData): Promise<WorkflowExecutionSummary> {
    const { workspaceId, workflowId, leadId, executionId } = jobData;

    // 1. Load the execution record
    const execution = await WorkflowExecution.findOne({
      _id: new Types.ObjectId(executionId),
      workspaceId: new Types.ObjectId(workspaceId)
    });

    if (!execution) {
      throw new AppError(404, `Workflow execution record ${executionId} not found.`);
    }

    // Idempotency: If this execution was already marked completed, skip processing
    if (execution.status === 'completed') {
      console.log(`[Idempotency Guard] Execution ${executionId} is already completed. Skipping.`);
      const workflow = await Workflow.findById(execution.workflowId).lean();
      return {
        executionId: execution._id.toString(),
        workflowId: execution.workflowId.toString(),
        workflowName: workflow?.name || 'Workflow',
        leadId: execution.leadId.toString(),
        status: execution.status,
        startedAt: execution.startedAt || new Date(),
        completedAt: execution.completedAt,
        stepsCount: execution.executionLog.length,
        executionLog: execution.executionLog
      };
    }

    // 2. Verify workflow is active and unarchived
    const workflow = await Workflow.findOne({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!workflow) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = 'Workflow not found or archived.';
      await execution.save();
      throw new AppError(404, 'Workflow not found or archived in this workspace.');
    }

    if (workflow.status !== 'active') {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = `Workflow is in "${workflow.status}" status. Must be active to execute.`;
      await execution.save();
      throw new AppError(400, `Workflow is in "${workflow.status}" status. Must be active to execute.`);
    }

    // 3. Verify lead belongs to workspace and is not archived
    const initialLead = await Lead.findOne({
      _id: new Types.ObjectId(leadId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!initialLead) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = 'Lead not found or archived in this workspace.';
      await execution.save();
      throw new AppError(404, 'Lead not found or archived in this workspace.');
    }

    let activeLead: ILead = initialLead;

    // Transition execution to running
    execution.status = 'running';
    if (!execution.startedAt) {
      execution.startedAt = new Date();
    }
    await execution.save();

    const executionLog: IWorkflowExecutionStep[] = [...execution.executionLog];

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

      // Record trigger step if not already recorded in executionLog
      if (!executionLog.some((s) => s.nodeId === triggerNode.id)) {
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
      }

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
            break;
          }
          currentNode = nodeMap.get(outEdges[0].target);
        } else if (currentNode.type === 'condition') {
          const conditionResult = this.evaluateCondition(activeLead, currentNode.data || {});
          const branchHandle = conditionResult ? 'yes' : 'no';

          // Idempotency: check if condition step was already evaluated
          const existingStepIndex = executionLog.findIndex((s) => s.nodeId === currentNode?.id);
          const stepRecord: IWorkflowExecutionStep = {
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
          };

          if (existingStepIndex >= 0) {
            executionLog[existingStepIndex] = stepRecord;
          } else {
            executionLog.push(stepRecord);
          }

          const branchEdge = outEdges.find((e) => e.sourceHandle === branchHandle);
          if (!branchEdge) {
            break;
          }

          currentNode = nodeMap.get(branchEdge.target);
        } else if (currentNode.type === 'action') {
          const actionType = currentNode.data?.actionType;

          if (actionType === 'update_lead') {
            const field = currentNode.data?.field || currentNode.data?.updateField;
            const value = currentNode.data?.value !== undefined ? currentNode.data?.value : currentNode.data?.updateValue;

            // Synchronously update the lead within the authenticated workspace
            const updatedLead: ILead | null = await Lead.findOneAndUpdate(
              {
                _id: activeLead._id,
                workspaceId: new Types.ObjectId(workspaceId),
                isArchived: false
              },
              { $set: { [field]: value } },
              { returnDocument: 'after', runValidators: true }
            );

            if (updatedLead) {
              activeLead = updatedLead;
            }

            const stepRecord: IWorkflowExecutionStep = {
              nodeId: currentNode.id,
              nodeType: 'action',
              status: 'executed',
              details: {
                actionType: 'update_lead',
                field,
                updatedValue: value
              },
              timestamp: new Date()
            };

            const existingStepIndex = executionLog.findIndex((s) => s.nodeId === currentNode?.id);
            if (existingStepIndex >= 0) {
              executionLog[existingStepIndex] = stepRecord;
            } else {
              executionLog.push(stepRecord);
            }
          } else if (actionType === 'send_email') {
            // Check if this action already successfully completed in a previous attempt (Email Idempotency)
            const priorCompletedEmail = executionLog.find(
              (s) => s.nodeId === currentNode?.id && s.status === 'completed'
            );

            if (priorCompletedEmail) {
              console.log(
                `[Email Idempotency Guard] Email action for node ${currentNode.id} was already delivered. Skipping re-send.`
              );
            } else {
              const templateId = currentNode.data?.templateId;
              if (!templateId) {
                throw new AppError(400, `Email action node "${currentNode.id}" is missing templateId.`);
              }

              const template = await EmailTemplate.findOne({
                _id: new Types.ObjectId(templateId),
                workspaceId: new Types.ObjectId(workspaceId),
                isArchived: false
              }).lean();

              if (!template) {
                throw new AppError(
                  404,
                  `Referenced email template "${templateId}" not found or archived in this workspace.`
                );
              }

              if (!activeLead.email) {
                throw new AppError(
                  400,
                  `Cannot send email: lead "${activeLead._id}" has no valid email address.`
                );
              }

              // Render template placeholders
              const leadData = {
                firstName: activeLead.firstName,
                lastName: activeLead.lastName,
                email: activeLead.email,
                phone: activeLead.phone,
                company: activeLead.company,
                source: activeLead.source,
                status: activeLead.status,
                priority: activeLead.priority
              };

              const renderedSubject = renderTemplate(template.subject, leadData);
              const renderedHtml = renderTemplate(template.htmlBody, leadData);
              const renderedText = template.textBody ? renderTemplate(template.textBody, leadData) : undefined;

              // Deliver through configured EmailService
              const sendResult = await this.emailServiceInstance.sendEmail({
                to: activeLead.email,
                subject: renderedSubject,
                html: renderedHtml,
                text: renderedText
              });

              const stepRecord: IWorkflowExecutionStep = {
                nodeId: currentNode.id,
                nodeType: 'action',
                status: 'completed',
                details: {
                  actionType: 'send_email',
                  templateId: template._id.toString(),
                  templateName: template.name,
                  recipient: activeLead.email,
                  messageId: sendResult.messageId,
                  accepted: sendResult.accepted
                },
                timestamp: new Date()
              };

              const existingStepIndex = executionLog.findIndex((s) => s.nodeId === currentNode?.id);
              if (existingStepIndex >= 0) {
                executionLog[existingStepIndex] = stepRecord;
              } else {
                executionLog.push(stepRecord);
              }
            }
          }

          if (outEdges.length === 0) {
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
        startedAt: execution.startedAt || completedAt,
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

  /**
   * Directly executes a workflow synchronously. Used for offline testing or manual unit test runs.
   */
  public static async executeWorkflowDirect(
    workspaceId: string,
    workflowId: string,
    leadId: string
  ): Promise<WorkflowExecutionSummary> {
    const execution = await WorkflowExecution.create({
      workspaceId: new Types.ObjectId(workspaceId),
      workflowId: new Types.ObjectId(workflowId),
      triggerType: 'manual',
      leadId: new Types.ObjectId(leadId),
      status: 'pending',
      executionLog: []
    });

    return this.executeWorkflowJob({
      workspaceId,
      workflowId,
      leadId,
      triggerType: 'manual',
      executionId: execution._id.toString()
    });
  }

  /**
   * Retrieves an execution record by ID, enforcing workspace isolation.
   */
  public static async getExecutionById(
    workspaceId: string,
    executionId: string
  ): Promise<IWorkflowExecution> {
    const execution = await WorkflowExecution.findOne({
      _id: new Types.ObjectId(executionId),
      workspaceId: new Types.ObjectId(workspaceId)
    }).lean();

    if (!execution) {
      throw new AppError(404, 'Workflow execution not found in this workspace.');
    }

    return execution as unknown as IWorkflowExecution;
  }

  /**
   * Lists executions for a workflow with pagination, newest first.
   */
  public static async listWorkflowExecutions(
    workspaceId: string,
    workflowId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: IWorkflowExecution[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    // 1. Verify workflow exists and belongs to the authenticated workspace
    const workflow = await Workflow.findOne({
      _id: new Types.ObjectId(workflowId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!workflow) {
      throw new AppError(404, 'Workflow not found in this workspace.');
    }

    const filter = {
      workspaceId: new Types.ObjectId(workspaceId),
      workflowId: new Types.ObjectId(workflowId)
    };

    const skip = (page - 1) * limit;

    const [total, executions] = await Promise.all([
      WorkflowExecution.countDocuments(filter),
      WorkflowExecution.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: executions as unknown as IWorkflowExecution[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }
}
