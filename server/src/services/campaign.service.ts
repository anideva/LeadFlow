import { Types } from 'mongoose';
import { Campaign, ICampaign, CampaignStatus } from '../models/Campaign.model';
import { EmailTemplate } from '../models/EmailTemplate.model';
import { Lead } from '../models/Lead.model';
import { CampaignLead, ICampaignLead, CampaignLeadStatus } from '../models/CampaignLead.model';
import { AppError } from '../utils/error.util';
import { renderTemplate } from '../utils/template-renderer.util';
import { emailService } from './email';
import { EmailService } from './email/email.service';
import { CampaignJobData, enqueueCampaignJobs } from '../queues/campaign.queue';

export interface CampaignLeadsQueryOptions {
  page: number;
  limit: number;
  status?: CampaignLeadStatus;
}

export interface PaginatedCampaignLeadsResult {
  data: ICampaignLead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CampaignStatsResult {
  totalLeads: number;
  pending: number;
  sent: number;
  failed: number;
}

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

  private static emailServiceInstance: EmailService = emailService;

  /**
   * Allows test runners to inject a mock EmailService instance.
   */
  public static setEmailServiceInstance(service: EmailService): void {
    this.emailServiceInstance = service;
  }

  /**
   * Lists leads associated with a specific campaign, enforcing workspace boundaries.
   * Populates lead fields (firstName, lastName, email, company, phone, status).
   */
  public static async listCampaignLeads(
    workspaceId: string,
    campaignId: string,
    options: CampaignLeadsQueryOptions
  ): Promise<PaginatedCampaignLeadsResult> {
    const { page, limit, status } = options;

    // 1. Verify campaign exists and belongs to this workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    // 2. Build multi-tenant filter on CampaignLead
    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      campaignId: new Types.ObjectId(campaignId)
    };

    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [total, campaignLeads] = await Promise.all([
      CampaignLead.countDocuments(filter),
      CampaignLead.find(filter)
        .populate({
          path: 'leadId',
          select: 'firstName lastName email company phone status'
        })
        .sort({ addedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: campaignLeads as unknown as ICampaignLead[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Removes a lead association from a campaign without deleting or archiving the underlying CRM lead.
   */
  public static async removeCampaignLead(
    workspaceId: string,
    campaignId: string,
    targetLeadId: string
  ): Promise<{ success: boolean; message: string }> {
    // 1. Verify campaign exists in workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    // 2. Remove the CampaignLead association (matching either CRM leadId or CampaignLead _id)
    const targetObjectId = new Types.ObjectId(targetLeadId);
    const deleted = await CampaignLead.findOneAndDelete({
      workspaceId: new Types.ObjectId(workspaceId),
      campaignId: new Types.ObjectId(campaignId),
      $or: [{ leadId: targetObjectId }, { _id: targetObjectId }]
    });

    if (!deleted) {
      throw new AppError(404, 'Campaign lead association not found in this workspace.');
    }

    return {
      success: true,
      message: 'Lead removed from campaign successfully.'
    };
  }

  /**
   * Aggregates campaign lead statistics using MongoDB aggregation pipeline.
   * Computes counts for totalLeads, pending, sent, and failed.
   */
  public static async getCampaignStats(
    workspaceId: string,
    campaignId: string
  ): Promise<CampaignStatsResult> {
    // 1. Verify campaign exists in workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    // 2. Group counts by status using MongoDB aggregation
    const stats = await CampaignLead.aggregate([
      {
        $match: {
          workspaceId: new Types.ObjectId(workspaceId),
          campaignId: new Types.ObjectId(campaignId)
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const counts: CampaignStatsResult = {
      totalLeads: 0,
      pending: 0,
      sent: 0,
      failed: 0
    };

    for (const item of stats) {
      if (item._id === 'pending') counts.pending = item.count;
      else if (item._id === 'sent') counts.sent = item.count;
      else if (item._id === 'failed') counts.failed = item.count;
    }

    counts.totalLeads = counts.pending + counts.sent + counts.failed;
    return counts;
  }

  /**
   * Dispatches a campaign for background delivery via BullMQ.
   * Validates campaign state, referenced template, and pending leads before enqueuing.
   */
  public static async sendCampaign(
    workspaceId: string,
    campaignId: string,
    userId: string
  ): Promise<{ campaignId: string; queued: number }> {
    // 1. Verify campaign exists in workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!campaign) {
      throw new AppError(404, 'Campaign not found in this workspace.');
    }

    // 2. Verify campaign is in draft or paused state
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new AppError(
        400,
        `Cannot dispatch campaign in "${campaign.status}" status. Only draft or paused campaigns can be dispatched.`
      );
    }

    // 3. Verify referenced template exists and is not archived
    const template = await EmailTemplate.findOne({
      _id: campaign.templateId,
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!template) {
      throw new AppError(400, 'Campaign email template is missing or archived.');
    }

    // 4. Find all pending leads for this campaign
    const pendingLeads = await CampaignLead.find({
      workspaceId: new Types.ObjectId(workspaceId),
      campaignId: new Types.ObjectId(campaignId),
      status: 'pending'
    })
      .select('_id')
      .lean();

    if (pendingLeads.length === 0) {
      throw new AppError(400, 'Campaign has no pending leads to dispatch.');
    }

    // 5. Transition campaign status to 'active'
    campaign.status = 'active';
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();

    // 6. Enqueue BullMQ jobs for background processing
    const jobsData: CampaignJobData[] = pendingLeads.map((pl) => ({
      campaignId,
      campaignLeadId: pl._id.toString(),
      workspaceId
    }));

    await enqueueCampaignJobs(jobsData);

    return {
      campaignId,
      queued: pendingLeads.length
    };
  }

  /**
   * Worker execution core: processes a single campaign lead job.
   * Enforces multi-tenant ownership, idempotency, template rendering, and delivery.
   */
  public static async processCampaignLead(
    jobData: CampaignJobData
  ): Promise<{ status: string; reason?: string; skipped?: boolean }> {
    const { campaignId, campaignLeadId, workspaceId } = jobData;

    // 1. Load CampaignLead strictly scoped to workspace
    const campaignLead = await CampaignLead.findOne({
      _id: new Types.ObjectId(campaignLeadId),
      campaignId: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId)
    });

    if (!campaignLead) {
      return { status: 'failed', reason: 'CampaignLead not found in workspace' };
    }

    // 2. Idempotency guard: skip if not pending
    if (campaignLead.status === 'sent') {
      return { status: 'sent', skipped: true, reason: 'Already sent' };
    }
    if (campaignLead.status === 'failed') {
      return { status: 'failed', skipped: true, reason: 'Already marked as failed' };
    }

    // 3. Load Campaign strictly scoped to workspace
    const campaign = await Campaign.findOne({
      _id: new Types.ObjectId(campaignId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    });

    if (!campaign) {
      campaignLead.status = 'failed';
      campaignLead.errorMessage = 'Campaign not found or archived';
      campaignLead.processedAt = new Date();
      await campaignLead.save();
      return { status: 'failed', reason: 'Campaign not found or archived' };
    }

    // 4. Load EmailTemplate strictly scoped to workspace
    const template = await EmailTemplate.findOne({
      _id: campaign.templateId,
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!template) {
      campaignLead.status = 'failed';
      campaignLead.errorMessage = 'Email template not found or archived';
      campaignLead.processedAt = new Date();
      await campaignLead.save();
      return { status: 'failed', reason: 'Email template not found or archived' };
    }

    // 5. Load Lead strictly scoped to workspace
    const lead = await Lead.findOne({
      _id: campaignLead.leadId,
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!lead) {
      campaignLead.status = 'failed';
      campaignLead.errorMessage = 'Lead not found or archived in workspace';
      campaignLead.processedAt = new Date();
      await campaignLead.save();
      return { status: 'failed', reason: 'Lead not found or archived in workspace' };
    }

    if (!lead.email || !lead.email.trim()) {
      campaignLead.status = 'failed';
      campaignLead.errorMessage = 'Lead has no valid email address';
      campaignLead.processedAt = new Date();
      await campaignLead.save();
      return { status: 'failed', reason: 'Lead has no valid email address' };
    }

    // 6. Render template placeholders
    const leadData = {
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email,
      phone: lead.phone || '',
      company: lead.company || '',
      source: lead.source || '',
      status: lead.status || '',
      priority: lead.priority || ''
    };

    const renderedSubject = renderTemplate(template.subject, leadData);
    const renderedHtml = renderTemplate(template.htmlBody, leadData);
    const renderedText = template.textBody ? renderTemplate(template.textBody, leadData) : undefined;

    // 7. Deliver email via EmailService
    try {
      await this.emailServiceInstance.sendEmail({
        to: lead.email,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText
      });

      campaignLead.status = 'sent';
      campaignLead.sentAt = new Date();
      campaignLead.processedAt = new Date();
      campaignLead.errorMessage = undefined;
      await campaignLead.save();
    } catch (sendError: any) {
      campaignLead.status = 'failed';
      campaignLead.errorMessage = sendError?.message || 'Email delivery failed';
      campaignLead.processedAt = new Date();
      await campaignLead.save();
    }

    // 8. Progress campaign status: if all leads are completed, mark campaign completed
    const remainingPending = await CampaignLead.countDocuments({
      campaignId: campaign._id,
      status: 'pending'
    });

    if (remainingPending === 0) {
      await Campaign.updateOne(
        { _id: campaign._id, status: 'active' },
        { $set: { status: 'completed' } }
      );
    }

    return { status: campaignLead.status };
  }
}
