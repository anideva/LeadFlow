import { Schema, model, Document, Types } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'replied' | 'qualified' | 'unresponsive' | 'bounced';
export type LeadSource = 'manual' | 'csv_import' | 'search_scraper' | 'api';

export interface ILeadLocation {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface ILead extends Document {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  jobTitle?: string;
  location?: ILeadLocation;
  status: LeadStatus;
  score: number;
  tags: string[];
  source: LeadSource;
  customFields: Map<string, any>;
  lastContactedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    fullName: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    },
    companyName: {
      type: String,
      trim: true
    },
    jobTitle: {
      type: String,
      trim: true
    },
    location: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postalCode: { type: String, trim: true }
    },
    status: {
      type: String,
      enum: {
        values: ['new', 'contacted', 'replied', 'qualified', 'unresponsive', 'bounced'],
        message: '{VALUE} is not a valid lead status'
      },
      default: 'new',
      index: true
    },
    score: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [100, 'Score cannot exceed 100'],
      default: 0,
      index: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    source: {
      type: String,
      enum: {
        values: ['manual', 'csv_import', 'search_scraper', 'api'],
        message: '{VALUE} is not a supported lead source'
      },
      default: 'manual'
    },
    customFields: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map()
    },
    lastContactedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Auto-derive fullName if firstName or lastName are updated
leadSchema.pre('save', function () {
  if (this.firstName || this.lastName) {
    this.fullName = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  }
});

// Workspace-scoped compound unique index for lead email deduplication.
// Allows multiple workspaces to hold the same contact email independently,
// but prevents duplicates inside the same workspace.
leadSchema.index(
  { workspaceId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } }
  }
);

// High-speed compound query index for workspace dashboard filtering by status and score
leadSchema.index({ workspaceId: 1, status: 1, score: -1 });

export const Lead = model<ILead>('Lead', leadSchema);
