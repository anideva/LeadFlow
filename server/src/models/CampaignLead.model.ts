import { Schema, model, Document, Types } from 'mongoose';

export type CampaignLeadStatus = 'pending' | 'sent' | 'failed';
export const CAMPAIGN_LEAD_STATUS_VALUES: CampaignLeadStatus[] = ['pending', 'sent', 'failed'];

export interface ICampaignLead extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  campaignId: Types.ObjectId;
  leadId: Types.ObjectId;
  status: CampaignLeadStatus;
  addedAt: Date;
  sentAt?: Date;
  errorMessage?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const campaignLeadSchema = new Schema<ICampaignLead>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true
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
        values: CAMPAIGN_LEAD_STATUS_VALUES,
        message: '{VALUE} is not a valid campaign lead status'
      },
      default: 'pending',
      index: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    sentAt: {
      type: Date
    },
    errorMessage: {
      type: String,
      trim: true
    },
    processedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Unique compound index: prevents duplicate associations of the same lead to the same campaign
campaignLeadSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });

// Multi-tenant query index for campaign leads
campaignLeadSchema.index({ workspaceId: 1, campaignId: 1, status: 1 });

export const CampaignLead = model<ICampaignLead>('CampaignLead', campaignLeadSchema);
