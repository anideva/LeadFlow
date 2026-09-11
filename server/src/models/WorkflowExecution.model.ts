import { Schema, model, Document, Types } from 'mongoose';
import { WorkflowTriggerType } from './Workflow.model';

export type WorkflowExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export const WORKFLOW_EXECUTION_STATUS_VALUES: WorkflowExecutionStatus[] = [
  'pending',
  'running',
  'completed',
  'failed'
];

export interface IWorkflowExecutionStep {
  nodeId: string;
  nodeType: string;
  status: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface IWorkflowExecution extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  workflowId: Types.ObjectId;
  triggerType: WorkflowTriggerType;
  leadId: Types.ObjectId;
  status: WorkflowExecutionStatus;
  currentNodeId?: string;
  executionLog: IWorkflowExecutionStep[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const executionStepSchema = new Schema<IWorkflowExecutionStep>(
  {
    nodeId: { type: String, required: true },
    nodeType: { type: String, required: true },
    status: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const workflowExecutionSchema = new Schema<IWorkflowExecution>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      required: [true, 'Workflow ID is required'],
      index: true
    },
    triggerType: {
      type: String,
      required: [true, 'Trigger type is required']
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead ID is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: WORKFLOW_EXECUTION_STATUS_VALUES,
        message: '{VALUE} is not a valid workflow execution status'
      },
      default: 'pending',
      index: true
    },
    currentNodeId: {
      type: String
    },
    executionLog: {
      type: [executionStepSchema],
      default: []
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    error: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for execution querying and monitoring
workflowExecutionSchema.index({ workspaceId: 1, workflowId: 1, createdAt: -1 });
workflowExecutionSchema.index({ workspaceId: 1, leadId: 1 });
workflowExecutionSchema.index({ workspaceId: 1, status: 1 });
workflowExecutionSchema.index({ createdAt: -1 });

export const WorkflowExecution = model<IWorkflowExecution>('WorkflowExecution', workflowExecutionSchema);
