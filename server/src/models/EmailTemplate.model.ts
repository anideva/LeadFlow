import { Schema, model, Document, Types } from 'mongoose';

export interface IEmailTemplate extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables: string[];
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [150, 'Template name cannot exceed 150 characters']
    },
    subject: {
      type: String,
      required: [true, 'Subject line is required'],
      trim: true,
      maxlength: [300, 'Subject line cannot exceed 300 characters']
    },
    htmlBody: {
      type: String,
      required: [true, 'HTML body is required']
    },
    textBody: {
      type: String,
      trim: true
    },
    variables: {
      type: [String],
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
emailTemplateSchema.index({ workspaceId: 1, isArchived: 1, createdAt: -1 });
emailTemplateSchema.index({ workspaceId: 1, isArchived: 1, name: 1 });

export const EmailTemplate = model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);
