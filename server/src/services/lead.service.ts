import { Types } from 'mongoose';
import { Lead, ILead, LeadStatus, LeadPriority } from '../models/Lead.model';
import { AppError } from '../utils/error.util';
import { WorkflowTriggerService } from './workflow-trigger.service';

export interface CreateLeadDTO {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  notes?: string;
}

export interface UpdateLeadDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  notes?: string;
}

export interface LeadQueryOptions {
  page: number;
  limit: number;
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedLeadsResult {
  data: ILead[];
  pagination: PaginationMeta;
}

export class LeadService {
  /**
   * Creates a new Lead strictly bound to the authenticated user's workspace.
   */
  public static async createLead(
    workspaceId: string,
    createdBy: string,
    dto: CreateLeadDTO
  ): Promise<ILead> {
    const lead = await Lead.create({
      workspaceId: new Types.ObjectId(workspaceId),
      createdBy: new Types.ObjectId(createdBy),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      source: dto.source || 'manual',
      status: dto.status || 'new',
      priority: dto.priority || 'medium',
      notes: dto.notes
    });

    // Trigger active workflows listening to lead_created event
    WorkflowTriggerService.triggerLeadCreated(workspaceId, lead).catch((err) => {
      console.warn('[LeadService] Workflow trigger error:', err?.message || err);
    });

    return lead;
  }

  /**
   * Lists leads for a workspace with database-level pagination, search, filter, and sorting.
   * Soft-deleted/archived leads are strictly excluded.
   */
  public static async listLeads(
    workspaceId: string,
    options: LeadQueryOptions
  ): Promise<PaginatedLeadsResult> {
    const { page, limit, search, status, priority, source, sortBy, sortOrder } = options;

    // Base multi-tenant filter: only current workspace and unarchived leads
    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    };

    // Case-insensitive multi-field search across firstName, lastName, email, phone, and company
    if (search && search.trim().length > 0) {
      // Escape regex special characters to prevent ReDoS or invalid regex syntax
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');

      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { company: searchRegex }
      ];
    }

    // Exact enum filters
    if (status) {
      filter.status = status;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (source) {
      filter.source = source;
    }

    // Controlled sorting
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObject: Record<string, 1 | -1> = {
      [sortBy]: sortDirection,
      _id: sortDirection // Secondary tie-breaker for deterministic pagination
    };

    const skip = (page - 1) * limit;

    // Database-level count and paginated query executed concurrently
    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: leads as unknown as ILead[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Retrieves a single lead by ID, enforcing workspace isolation.
   */
  public static async getLeadById(
    workspaceId: string,
    leadId: string
  ): Promise<ILead> {
    const lead = await Lead.findOne({
      _id: new Types.ObjectId(leadId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!lead) {
      throw new AppError(404, 'Lead not found in this workspace.');
    }

    return lead as unknown as ILead;
  }

  /**
   * Updates a lead by ID with whitelisted fields only, enforcing workspace isolation.
   */
  public static async updateLead(
    workspaceId: string,
    leadId: string,
    dto: UpdateLeadDTO
  ): Promise<ILead> {
    const updatedLead = await Lead.findOneAndUpdate(
      {
        _id: new Types.ObjectId(leadId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      { $set: dto },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedLead) {
      throw new AppError(404, 'Lead not found in this workspace.');
    }

    return updatedLead as unknown as ILead;
  }

  /**
   * Soft-deletes (archives) a lead by setting isArchived: true.
   * Enforces workspace isolation.
   */
  public static async archiveLead(
    workspaceId: string,
    leadId: string
  ): Promise<{ id: string; isArchived: boolean }> {
    const archivedLead = await Lead.findOneAndUpdate(
      {
        _id: new Types.ObjectId(leadId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      { $set: { isArchived: true } },
      { new: true }
    ).lean();

    if (!archivedLead) {
      throw new AppError(404, 'Lead not found in this workspace.');
    }

    return {
      id: archivedLead._id.toString(),
      isArchived: true
    };
  }
}
