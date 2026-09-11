import { Types } from 'mongoose';
import {
  IWorkflowNode,
  IWorkflowEdge,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_TRIGGER_VALUES,
  ALLOWED_LEAD_CONDITION_FIELDS,
  ALLOWED_LEAD_UPDATE_FIELDS,
  CONDITION_OPERATORS
} from '../models/Workflow.model';
import { EmailTemplate } from '../models/EmailTemplate.model';
import { AppError } from './error.util';

export interface WorkflowGraphInput {
  triggerType: string;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
}

export class WorkflowGraphValidator {
  /**
   * Performs complete server-side graph validation for a workflow.
   * Throws an AppError with status 400 if any validation rule fails.
   */
  public static async validateGraph(
    workspaceId: string,
    graph: WorkflowGraphInput
  ): Promise<void> {
    const { triggerType, nodes, edges } = graph;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new AppError(400, 'Workflow must contain at least one node.');
    }

    if (!Array.isArray(edges)) {
      throw new AppError(400, 'Workflow edges must be an array.');
    }

    // 1. Validate Node IDs uniqueness
    const nodeIds = new Set<string>();
    const nodeMap = new Map<string, IWorkflowNode>();

    for (const node of nodes) {
      if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
        throw new AppError(400, 'Each node must have a non-empty string ID.');
      }
      if (nodeIds.has(node.id)) {
        throw new AppError(400, `Duplicate node ID detected: "${node.id}".`);
      }
      nodeIds.add(node.id);
      nodeMap.set(node.id, node);
    }

    // 2. Validate Edge IDs uniqueness & duplicate edges
    const edgeIds = new Set<string>();
    const edgeKeySet = new Set<string>();

    for (const edge of edges) {
      if (!edge.id || typeof edge.id !== 'string' || edge.id.trim() === '') {
        throw new AppError(400, 'Each edge must have a non-empty string ID.');
      }
      if (edgeIds.has(edge.id)) {
        throw new AppError(400, `Duplicate edge ID detected: "${edge.id}".`);
      }
      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.source)) {
        throw new AppError(400, `Edge "${edge.id}" references nonexistent source node: "${edge.source}".`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new AppError(400, `Edge "${edge.id}" references nonexistent target node: "${edge.target}".`);
      }
      if (edge.source === edge.target) {
        throw new AppError(400, `Edge "${edge.id}" creates a self-loop on node: "${edge.source}".`);
      }

      const edgeKey = `${edge.source}-->${edge.target}::${edge.sourceHandle || ''}`;
      if (edgeKeySet.has(edgeKey)) {
        throw new AppError(400, `Duplicate edge detected between "${edge.source}" and "${edge.target}".`);
      }
      edgeKeySet.add(edgeKey);
    }

    // 3. Exactly ONE trigger node
    const triggerNodes = nodes.filter((n) => n.type === 'trigger');
    if (triggerNodes.length === 0) {
      throw new AppError(400, 'Workflow must contain exactly one trigger node. Found 0.');
    }
    if (triggerNodes.length > 1) {
      throw new AppError(
        400,
        `Workflow must contain exactly one trigger node. Found ${triggerNodes.length}.`
      );
    }

    const triggerNode = triggerNodes[0];
    const nodeTriggerType = triggerNode.data?.triggerType;

    if (!nodeTriggerType || !WORKFLOW_TRIGGER_VALUES.includes(nodeTriggerType)) {
      throw new AppError(
        400,
        `Trigger node "${triggerNode.id}" has invalid triggerType: "${nodeTriggerType}". Allowed: ${WORKFLOW_TRIGGER_VALUES.join(', ')}.`
      );
    }

    if (triggerType && triggerType !== nodeTriggerType) {
      throw new AppError(
        400,
        `Workflow triggerType "${triggerType}" does not match trigger node triggerType "${nodeTriggerType}".`
      );
    }

    // 4. Validate each node's type and configuration
    for (const node of nodes) {
      if (!WORKFLOW_NODE_TYPES.includes(node.type)) {
        throw new AppError(400, `Unsupported node type: "${node.type}". Allowed: ${WORKFLOW_NODE_TYPES.join(', ')}.`);
      }

      if (node.type === 'condition') {
        const condType = node.data?.conditionType;
        if (condType !== 'lead_field') {
          throw new AppError(
            400,
            `Condition node "${node.id}" has unsupported conditionType: "${condType}". Allowed: lead_field.`
          );
        }

        const field = node.data?.field;
        if (!field || !(ALLOWED_LEAD_CONDITION_FIELDS as readonly string[]).includes(field)) {
          throw new AppError(
            400,
            `Condition node "${node.id}" references unsupported lead field: "${field}". Allowed: ${ALLOWED_LEAD_CONDITION_FIELDS.join(', ')}.`
          );
        }

        const operator = node.data?.operator;
        if (!operator || !CONDITION_OPERATORS.includes(operator)) {
          throw new AppError(
            400,
            `Condition node "${node.id}" references unsupported operator: "${operator}". Allowed: ${CONDITION_OPERATORS.join(', ')}.`
          );
        }

        // Validate values unless operator is exists/not_exists
        if (operator !== 'exists' && operator !== 'not_exists') {
          if (node.data?.value === undefined || node.data?.value === null) {
            throw new AppError(
              400,
              `Condition node "${node.id}" with operator "${operator}" requires a comparison value.`
            );
          }
        }
      }

      if (node.type === 'action') {
        const actionType = node.data?.actionType;
        if (!actionType || !WORKFLOW_ACTION_TYPES.includes(actionType)) {
          throw new AppError(
            400,
            `Action node "${node.id}" has unsupported actionType: "${actionType}". Allowed: ${WORKFLOW_ACTION_TYPES.join(', ')}.`
          );
        }

        if (actionType === 'send_email') {
          const templateId = node.data?.templateId;
          if (!templateId || typeof templateId !== 'string' || !Types.ObjectId.isValid(templateId)) {
            throw new AppError(
              400,
              `Action node "${node.id}" references an invalid email template ID.`
            );
          }

          // Template verification: exists, same workspace, not archived
          const template = await EmailTemplate.findById(new Types.ObjectId(templateId)).lean();
          if (!template) {
            throw new AppError(
              400,
              `Action node "${node.id}" references a template that does not exist.`
            );
          }

          if (template.workspaceId.toString() !== workspaceId) {
            throw new AppError(
              400,
              `Action node "${node.id}" references a template belonging to another workspace.`
            );
          }

          if (template.isArchived) {
            throw new AppError(
              400,
              `Action node "${node.id}" references an archived email template.`
            );
          }
        }

        if (actionType === 'update_lead') {
          const field = node.data?.field;
          if (!field || !(ALLOWED_LEAD_UPDATE_FIELDS as readonly string[]).includes(field)) {
            throw new AppError(
              400,
              `Action node "${node.id}" references unsupported update field: "${field}". Allowed: ${ALLOWED_LEAD_UPDATE_FIELDS.join(', ')}.`
            );
          }

          if (node.data?.value === undefined || node.data?.value === null) {
            throw new AppError(
              400,
              `Action node "${node.id}" requires a value for update field "${field}".`
            );
          }
        }
      }
    }

    // 5. Validate Edges branching & handles
    const outgoingEdges = new Map<string, IWorkflowEdge[]>();
    for (const edge of edges) {
      const list = outgoingEdges.get(edge.source) || [];
      list.push(edge);
      outgoingEdges.set(edge.source, list);
    }

    for (const node of nodes) {
      const edgesFromNode = outgoingEdges.get(node.id) || [];

      if (node.type === 'condition') {
        const yesEdges: IWorkflowEdge[] = [];
        const noEdges: IWorkflowEdge[] = [];

        for (const e of edgesFromNode) {
          if (e.sourceHandle !== 'yes' && e.sourceHandle !== 'no') {
            throw new AppError(
              400,
              `Condition node "${node.id}" outgoing edge "${e.id}" must have sourceHandle of "yes" or "no". Received: "${e.sourceHandle}".`
            );
          }
          if (e.sourceHandle === 'yes') yesEdges.push(e);
          if (e.sourceHandle === 'no') noEdges.push(e);
        }

        if (yesEdges.length > 1) {
          throw new AppError(400, `Condition node "${node.id}" has multiple "yes" branch edges.`);
        }
        if (noEdges.length > 1) {
          throw new AppError(400, `Condition node "${node.id}" has multiple "no" branch edges.`);
        }
      } else {
        // Trigger and Action nodes should have at most one outgoing edge for deterministic execution
        if (edgesFromNode.length > 1) {
          throw new AppError(
            400,
            `${node.type === 'trigger' ? 'Trigger' : 'Action'} node "${node.id}" cannot have multiple outgoing edges.`
          );
        }
      }
    }

    // 6. Reachability Validation: Every non-trigger node must be reachable from the trigger node
    const reachable = new Set<string>();
    const queue: string[] = [triggerNode.id];
    reachable.add(triggerNode.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextEdges = outgoingEdges.get(current) || [];
      for (const e of nextEdges) {
        if (!reachable.has(e.target)) {
          reachable.add(e.target);
          queue.push(e.target);
        }
      }
    }

    if (reachable.size < nodes.length) {
      const unreachable = nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);
      throw new AppError(
        400,
        `Disconnected node(s) detected: ${unreachable.map((id) => `"${id}"`).join(', ')}. Every non-trigger node must be reachable from the trigger node.`
      );
    }

    // 7. DAG Cycle Detection: DFS coloring
    // 0: Unvisited (White), 1: Visiting (Gray), 2: Visited (Black)
    const color = new Map<string, number>();
    for (const node of nodes) {
      color.set(node.id, 0);
    }

    const dfs = (nodeId: string): void => {
      color.set(nodeId, 1); // Mark as visiting (gray)

      const edgesFromNode = outgoingEdges.get(nodeId) || [];
      for (const e of edgesFromNode) {
        const targetColor = color.get(e.target) || 0;
        if (targetColor === 1) {
          // Back-edge to an active ancestor on recursion stack -> cycle detected!
          throw new AppError(
            400,
            `Workflow contains a cycle involving edge from "${nodeId}" to "${e.target}". Workflows must be Directed Acyclic Graphs (DAGs).`
          );
        }
        if (targetColor === 0) {
          dfs(e.target);
        }
      }

      color.set(nodeId, 2); // Mark as visited (black)
    };

    dfs(triggerNode.id);
  }
}
