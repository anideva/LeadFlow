import { Types } from 'mongoose';
import { Campaign, ICampaign, CampaignStatus } from '../models/Campaign.model';
import { EmailTemplate } from '../models/EmailTemplate.model';
import { Lead } from '../models/Lead.model';
import { CampaignLead } from '../models/CampaignLead.model';
import { AppError } from '../utils/error.util';

export interface CreateCampaignDTO {
  name: string;
  templateId: string;
  description?: string;
  status?: CampaignStatus;
}

export interface UpdateCampaignDTO {
  name?: string;
  templateId?: string;
  description?: string;
  status?: CampaignStatus;
}

export interface CampaignQueryOptions {
  page: number;
  limit: number;
  status?: CampaignStatus;
  search?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedCampaignsResult {
  data: ICampaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AssociateLeadsResult {
  added: number;
  alreadyAssociated: number;
  invalid: number;
}

export class CampaignService {
  /**
   * Creates a new campaign, ensuring referenced email template exists and belongs to the same workspace.
   */
  public static async createCampaign(
    workspaceId: string,
    userId: string,
    dto: CreateCampaignDTO
  ): Promise<ICampaign> {
    // 1. Verify template exists in current workspace and is not archived
    const template = await EmailTemplate.findOne({
      _id: new Types.ObjectId(dto.templateId),
      workspaceId: new Types.ObjectId(workspaceId)
    }).lean();

    if (!template) {
      throw new AppError(404, 'Referenced email template not found in this workspace.');
    }

    if (template.isArchived) {
      throw new AppError(400, 'Cannot use an archived email template for campaigns.');
    }

    // 2. Create campaign
    const campaign = await Campaign.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: dto.name,
      description: dto.description,
      templateId: new Types.ObjectId(dto.templateId),
      status: dto.status || 'draft',
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      isArchived: false
    });

    return campaign;
  }

  /**
   * Lists campaigns with database-level pagination, sorting, status filter, and search.
   */
  public static async listCampaigns(
    workspaceId: string,
    options: CampaignQueryOptions
  ): Promise<PaginatedCampaignsResult> {
    const { page, limit, status, search, sortBy, sortOrder } = options;

    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    };

    if (status) {
      filter.status = status;
    }

    if (search && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = new RegExp(escaped, 'i');
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObject: Record<string, 1 | -1> = {
      [sortBy]: sortDirection,
      _id: sortDirection
    };

    const skip = (page - 1) * limit;

    const [total, campaigns] = await Promise.all([
      Campaign.countDocuments(filter),
      Campaign.find(filter)
        .populate('templateId', 'name subject')
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: campaigns as unknown as ICampaign[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Retrieves a single campaign by ID with populated template summary.
   */
  public static async getCampaignById(
    workspaceId: string,
    campaignId: string
  ): Promise<ICampaign> {
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    })
      .populate('templateId', 'name subject')
      .lean();

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    return campaign as unknown as ICampaign;
  }

  /**
   * Updates a campaign, re-verifying template validity if templateId is updated.
   */
  public static async updateCampaign(
    workspaceId: string,
    campaignId: string,
    userId: string,
    dto: UpdateCampaignDTO
  ): Promise<ICampaign> {
    if (dto.templateId) {
      const template = await EmailTemplate.findOne({
        _id: new Types.ObjectId(dto.templateId),
        workspaceId: new Types.ObjectId(workspaceId)
      }).lean();

      if (!template) {
        throw new AppError(404, 'Referenced email template not found in this workspace.');
      }

      if (template.isArchived) {
        throw new AppError(400, 'Cannot use an archived email template for campaigns.');
      }
    }

    const updated = await Campaign.findOneAndUpdate(
      {
        _id: new Types.ObjectId(campaignId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      {
        $set: {
          ...dto,
          ...(dto.templateId ? { templateId: new Types.ObjectId(dto.templateId) } : {}),
          updatedBy: new Types.ObjectId(userId)
        }
      },
      { new: true, runValidators: true }
    )
      .populate('templateId', 'name subject')
      .lean();

    if (!updated) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    return updated as unknown as ICampaign;
  }

  /**
   * Soft-deletes (archives) a campaign.
   */
  public static async archiveCampaign(
    workspaceId: string,
    campaignId: string,
    userId: string
  ): Promise<{ id: string; isArchived: boolean }> {
    const archived = await Campaign.findOneAndUpdate(
      {
        _id: new Types.ObjectId(campaignId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      {
        $set: {
          isArchived: true,
          updatedBy: new Types.ObjectId(userId)
        }
      },
      { new: true }
    ).lean();

    if (!archived) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    return {
      id: archived._id.toString(),
      isArchived: true
    };
  }

  /**
   * Associates existing leads in the workspace with a campaign.
   * Handles duplicate associations, foreign leads, and archived leads safely.
   */
  public static async associateLeads(
    workspaceId: string,
    campaignId: string,
    leadIds: string[]
  ): Promise<AssociateLeadsResult> {
    // 1. Verify campaign exists and is active in current workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    // 2. Deduplicate input lead IDs
    const uniqueLeadIds = Array.from(new Set(leadIds));

    // 3. Find active leads belonging strictly to this workspace
    const validLeads = await Lead.find({
      _id: { $in: uniqueLeadIds.map(id => new Types.ObjectId(id)) },
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    })
      .select('_id')
      .lean();

    const validLeadIdStrings = new Set(validLeads.map(l => l._id.toString()));
    const invalidCount = uniqueLeadIds.filter(id => !validLeadIdStrings.has(id)).length;

    if (validLeads.length === 0) {
      return {
        added: 0,
        alreadyAssociated: 0,
        invalid: invalidCount
      };
    }

    // 4. Find existing associations for this campaign to prevent duplicates
    const existingAssociations = await CampaignLead.find({
      campaignId: new Types.ObjectId(campaignId),
      leadId: { $in: validLeads.map(l => l._id) }
    })
      .select('leadId')
      .lean();

    const existingLeadIdSet = new Set(existingAssociations.map(a => a.leadId.toString()));
    const alreadyAssociatedCount = existingLeadIdSet.size;

    // 5. Prepare documents to insert
    const newRecords = validLeads
      .filter(lead => !existingLeadIdSet.has(lead._id.toString()))
      .map(lead => ({
        workspaceId: new Types.ObjectId(workspaceId),
        campaignId: new Types.ObjectId(campaignId),
        leadId: lead._id,
        status: 'pending' as const,
        addedAt: new Date()
      }));

    if (newRecords.length > 0) {
      await CampaignLead.insertMany(newRecords, { ordered: false });
    }

    return {
      added: newRecords.length,
      alreadyAssociated: alreadyAssociatedCount,
      invalid: invalidCount
    };
  }
}
