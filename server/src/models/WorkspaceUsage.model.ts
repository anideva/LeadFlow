import { Schema, model, Document } from 'mongoose';

export interface IWorkspaceUsage extends Document {
  workspaceId: string;
  date: string; // UTC date string in YYYY-MM-DD format
  apifySearchCount: number;
  lastApifySearchAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceUsageSchema = new Schema<IWorkspaceUsage>(
  {
    workspaceId: {
      type: String,
      required: [true, 'Workspace ID is required'],
      index: true
    },
    date: {
      type: String,
      required: [true, 'Usage tracking date (YYYY-MM-DD) is required'],
      index: true
    },
    apifySearchCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    lastApifySearchAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index ensuring atomic one-record-per-day enforcement per workspace
workspaceUsageSchema.index({ workspaceId: 1, date: 1 }, { unique: true });

export const WorkspaceUsage = model<IWorkspaceUsage>('WorkspaceUsage', workspaceUsageSchema);
