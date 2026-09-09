import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'member';

export interface IUser extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string; // Prepared for Phase 2 authentication
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      // Current MVP: Globally unique email address per user account.
      // Note: If multi-workspace user membership is introduced later,
      // this global unique constraint can be migrated to a WorkspaceMember junction table
      // or composite index { workspaceId: 1, email: 1 }.
      unique: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'member'],
        message: '{VALUE} is not a supported role'
      },
      default: 'admin'
    }
  },
  {
    timestamps: true
  }
);

export const User = model<IUser>('User', userSchema);
