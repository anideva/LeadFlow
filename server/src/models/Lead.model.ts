import { Schema, model, Document, Types } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
export type LeadPriority = 'low' | 'medium' | 'high';

export interface ILead extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status: LeadStatus;
  priority: LeadPriority;
  notes?: string;
  createdBy: Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const LEAD_STATUS_VALUES: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
export const LEAD_PRIORITY_VALUES: LeadPriority[] = ['low', 'medium', 'high'];

const leadSchema = new Schema<ILead>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [100, 'First name cannot exceed 100 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [100, 'Last name cannot exceed 100 characters']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, 'Email cannot exceed 255 characters']
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [50, 'Phone cannot exceed 50 characters']
    },
    company: {
      type: String,
      trim: true,
      maxlength: [150, 'Company cannot exceed 150 characters']
    },
    source: {
      type: String,
      trim: true,
      default: 'manual',
      maxlength: [100, 'Source cannot exceed 100 characters']
    },
    status: {
      type: String,
      enum: {
        values: LEAD_STATUS_VALUES,
        message: '{VALUE} is not a valid lead status'
      },
      default: 'new'
    },
    priority: {
      type: String,
      enum: {
        values: LEAD_PRIORITY_VALUES,
        message: '{VALUE} is not a valid lead priority'
      },
      default: 'medium'
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [5000, 'Notes cannot exceed 5000 characters']
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'CreatedBy user ID is required'],
      index: true
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

// --- Compound Indexes for CRM Query Performance & Multi-Tenant Isolation ---

// 1. Primary listing and pagination index (workspace-scoped, non-archived, descending createdAt)
leadSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });

// 2. Status filtering index
leadSchema.index({ workspaceId: 1, isArchived: 1, status: 1 });

// 3. Priority filtering index
leadSchema.index({ workspaceId: 1, isArchived: 1, priority: 1 });

// 4. Source filtering index
leadSchema.index({ workspaceId: 1, isArchived: 1, source: 1 });

// 5. Name sorting index
leadSchema.index({ workspaceId: 1, isArchived: 1, firstName: 1 });

// 6. Company sorting index
leadSchema.index({ workspaceId: 1, isArchived: 1, company: 1 });

// 7. Email lookup index within a workspace
leadSchema.index(
  { workspaceId: 1, email: 1 },
  { partialFilterExpression: { email: { $type: 'string' } } }
);

export const Lead = model<ILead>('Lead', leadSchema);
