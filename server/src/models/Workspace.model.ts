import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkspaceSettings {
  timezone: string;
  currency: string;
}

export interface IWorkspace extends Document {
  _id: Types.ObjectId;
  name: string;
  ownerId?: Types.ObjectId;
  settings: IWorkspaceSettings;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>(
  {
    name: {
      type: String,
      required: [true, 'Workspace name is required'],
      trim: true,
      maxlength: [100, 'Workspace name cannot exceed 100 characters']
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    settings: {
      timezone: {
        type: String,
        default: 'UTC',
        trim: true
      },
      currency: {
        type: String,
        default: 'USD',
        trim: true
      }
    }
  },
  {
    timestamps: true
  }
);

export const Workspace = model<IWorkspace>('Workspace', workspaceSchema);
