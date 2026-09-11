import { Types } from 'mongoose';
import { EmailTemplate, IEmailTemplate } from '../models/EmailTemplate.model';
import { AppError } from '../utils/error.util';

export interface CreateTemplateDTO {
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables: string[];
}

export interface UpdateTemplateDTO {
  name?: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  variables?: string[];
}

export interface TemplateQueryOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedTemplatesResult {
  data: IEmailTemplate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class EmailTemplateService {
  /**
   * Creates a new EmailTemplate strictly bound to the authenticated user's workspace.
   */
  public static async createTemplate(
    workspaceId: string,
    userId: string,
    dto: CreateTemplateDTO
  ): Promise<IEmailTemplate> {
    const template = await EmailTemplate.create({
      workspaceId: new Types.ObjectId(workspaceId),
      name: dto.name,
      subject: dto.subject,
      htmlBody: dto.htmlBody,
      textBody: dto.textBody,
      variables: dto.variables || [],
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      isArchived: false
    });

    return template;
  }

  /**
   * Lists email templates for a workspace with database-level pagination, sorting, and search.
   */
  public static async listTemplates(
    workspaceId: string,
    options: TemplateQueryOptions
  ): Promise<PaginatedTemplatesResult> {
    const { page, limit, search, sortBy, sortOrder } = options;

    const filter: Record<string, any> = {
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    };

    if (search && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      filter.$or = [{ name: searchRegex }, { subject: searchRegex }];
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObject: Record<string, 1 | -1> = {
      [sortBy]: sortDirection,
      _id: sortDirection
    };

    const skip = (page - 1) * limit;

    const [total, templates] = await Promise.all([
      EmailTemplate.countDocuments(filter),
      EmailTemplate.find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: templates as unknown as IEmailTemplate[],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Retrieves a single email template by ID, strictly enforcing workspace isolation.
   */
  public static async getTemplateById(
    workspaceId: string,
    templateId: string
  ): Promise<IEmailTemplate> {
    const template = await EmailTemplate.findOne({
      _id: new Types.ObjectId(templateId),
      workspaceId: new Types.ObjectId(workspaceId),
      isArchived: false
    }).lean();

    if (!template) {
      throw new AppError(404, 'Email template not found in this workspace.');
    }

    return template as unknown as IEmailTemplate;
  }

  /**
   * Updates an email template by ID, enforcing workspace isolation.
   */
  public static async updateTemplate(
    workspaceId: string,
    templateId: string,
    userId: string,
    dto: UpdateTemplateDTO
  ): Promise<IEmailTemplate> {
    const updated = await EmailTemplate.findOneAndUpdate(
      {
        _id: new Types.ObjectId(templateId),
        workspaceId: new Types.ObjectId(workspaceId),
        isArchived: false
      },
      {
        $set: {
          ...dto,
          updatedBy: new Types.ObjectId(userId)
        }
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new AppError(404, 'Email template not found in this workspace.');
    }

    return updated as unknown as IEmailTemplate;
  }

  /**
   * Soft-deletes (archives) an email template.
   */
  public static async archiveTemplate(
    workspaceId: string,
    templateId: string,
    userId: string
  ): Promise<{ id: string; isArchived: boolean }> {
    const archived = await EmailTemplate.findOneAndUpdate(
      {
        _id: new Types.ObjectId(templateId),
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
      throw new AppError(404, 'Email template not found in this workspace.');
    }

    return {
      id: archived._id.toString(),
      isArchived: true
    };
  }
}
