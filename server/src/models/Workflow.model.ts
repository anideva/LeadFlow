import { Schema, model, Document, Types } from 'mongoose';

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

export const WORKFLOW_STATUS_VALUES: WorkflowStatus[] = ['draft', 'active', 'paused'];
export const WORKFLOW_TRIGGER_VALUES: WorkflowTriggerType[] = [
  'lead_created',
  'lead_updated',
  'manual'
];
export const WORKFLOW_NODE_TYPES: WorkflowNodeType[] = ['trigger', 'condition', 'action'];
export const WORKFLOW_ACTION_TYPES: WorkflowActionType[] = ['send_email', 'update_lead'];
export const WORKFLOW_CONDITION_TYPES: WorkflowConditionType[] = ['lead_field'];
export const CONDITION_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'exists',
  'not_exists'
];

export const ALLOWED_LEAD_CONDITION_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
] as const;

export const ALLOWED_LEAD_UPDATE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
] as const;

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

export interface IWorkflow extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description?: string;
  status: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workflowNodeSchema = new Schema<IWorkflowNode>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: WORKFLOW_NODE_TYPES,
      required: true
    },
    position: {
      x: { type: Number, required: true, default: 0 },
      y: { type: Number, required: true, default: 0 }
    },
    data: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { _id: false }
);

const workflowEdgeSchema = new Schema<IWorkflowEdge>(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String }
  },
  { _id: false }
);

const workflowSchema = new Schema<IWorkflow>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Workflow name is required'],
      trim: true,
      maxlength: [150, 'Workflow name cannot exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    status: {
      type: String,
      enum: {
        values: WORKFLOW_STATUS_VALUES,
        message: '{VALUE} is not a valid workflow status'
      },
      default: 'draft'
    },
    triggerType: {
      type: String,
      enum: {
        values: WORKFLOW_TRIGGER_VALUES,
        message: '{VALUE} is not a valid workflow trigger type'
      },
      required: [true, 'Workflow trigger type is required']
    },
    nodes: {
      type: [workflowNodeSchema],
      default: []
    },
    edges: {
      type: [workflowEdgeSchema],
      default: []
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'CreatedBy user ID is required'],
      index: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'UpdatedBy user ID is required']
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for workspace multi-tenancy, filtering, and sorting
workflowSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });
workflowSchema.index({ workspaceId: 1, isArchived: 1, status: 1 });

export const Workflow = model<IWorkflow>('Workflow', workflowSchema);
