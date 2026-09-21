import { Types } from 'mongoose';
import { Lead, ILead, LeadStatus, LeadPriority } from '../models/Lead.model';
import { AppError } from '../utils/error.util';
import { WorkflowTriggerService } from './workflow-trigger.service';
import {
  BulkOperationSanitized,
  BulkLeadAction,
  LeadExportQuerySanitized
} from '../validators/lead.validator';

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

  /**
   * Performs bulk operations (status update, priority update, or archive)
   * on a list of leads strictly scoped to the authenticated workspace.
   * Soft-deleted/archived leads are excluded from active operations.
   */
  public static async bulkLeadOperation(
    workspaceId: string,
    operation: BulkOperationSanitized
  ): Promise<{
    operation: BulkLeadAction;
    targetedCount: number;
    matchedCount: number;
    modifiedCount: number;
  }> {
    const objectIds = operation.leadIds.map((id) => new Types.ObjectId(id));

    // Multi-tenant isolation: enforce workspace and unarchived status directly in the query
    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      _id: { $in: objectIds },
      isArchived: false
    };

    let updateDoc: Record<string, any> = {};

    if (operation.action === 'update_status') {
      updateDoc = { $set: { status: operation.status } };
    } else if (operation.action === 'update_priority') {
      updateDoc = { $set: { priority: operation.priority } };
    } else if (operation.action === 'archive') {
      updateDoc = { $set: { isArchived: true } };
    }

    const updateResult = await Lead.updateMany(filter, updateDoc);

    return {
      operation: operation.action,
      targetedCount: operation.leadIds.length,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    };
  }

  /**
   * Exports leads belonging to the workspace matching the specified query or ID filter as RFC 4180 CSV.
   * Archived leads are excluded.
   */
  public static async exportLeads(
    workspaceId: string,
    query: LeadExportQuerySanitized
  ): Promise<{ csv: string; count: number; filename: string }> {
    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    };

    if (query.leadIds && query.leadIds.length > 0) {
      const objectIds = query.leadIds.map((id) => new Types.ObjectId(id));
      filter._id = { $in: objectIds };
    } else {
      if (query.search && query.search.trim().length > 0) {
        const escapedSearch = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(escapedSearch, 'i');
        filter.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { company: searchRegex }
        ];
      }

      if (query.status) {
        filter.status = query.status;
      }

      if (query.priority) {
        filter.priority = query.priority;
      }

      if (query.source) {
        filter.source = query.source;
      }
    }

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const headers = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'company',
      'source',
      'status',
      'priority',
      'notes',
      'createdAt'
    ];

    const escapeCsvValue = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = leads.map((lead) => {
      return [
        escapeCsvValue(lead.firstName),
        escapeCsvValue(lead.lastName),
        escapeCsvValue(lead.email),
        escapeCsvValue(lead.phone),
        escapeCsvValue(lead.company),
        escapeCsvValue(lead.source),
        escapeCsvValue(lead.status),
        escapeCsvValue(lead.priority),
        escapeCsvValue(lead.notes),
        escapeCsvValue(lead.createdAt ? new Date(lead.createdAt).toISOString() : '')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `leadflow-leads-${dateStr}.csv`;

    return {
      csv: csvContent,
      count: leads.length,
      filename
    };
  }
}

