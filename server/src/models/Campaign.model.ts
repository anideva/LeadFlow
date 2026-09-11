import { Schema, model, Document, Types } from 'mongoose';

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'paused';
export const CAMPAIGN_STATUS_VALUES: CampaignStatus[] = ['draft', 'active', 'completed', 'paused'];

export interface ICampaign extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description?: string;
  templateId: Types.ObjectId;
  status: CampaignStatus;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      maxlength: [150, 'Campaign name cannot exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Campaign description cannot exceed 1000 characters']
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmailTemplate',
      required: [true, 'Email template ID is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: CAMPAIGN_STATUS_VALUES,
        message: '{VALUE} is not a valid campaign status'
      },
      default: 'draft',
      index: true
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
campaignSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });
campaignSchema.index({ workspaceId: 1, isArchived: 1, status: 1 });
campaignSchema.index({ workspaceId: 1, templateId: 1 });

export const Campaign = model<ICampaign>('Campaign', campaignSchema);
