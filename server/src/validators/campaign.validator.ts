import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { CAMPAIGN_STATUS_VALUES, CampaignStatus } from '../models/Campaign.model';

const PROTECTED_FIELDS = ['_id', 'workspaceId', 'createdBy', 'isArchived', 'createdAt', 'updatedAt'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'status'];

/**
 * Validates campaign ID parameter format.
 */
export const validateCampaignObjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid campaign ID format.'
    });
    return;
  }

  next();
};

/**
 * Validates body for POST /api/campaigns.
 */
export const validateCreateCampaign = (req: Request, res: Response, next: NextFunction): void => {
  const { name, description, templateId, status } = req.body || {};

  // 1. Name validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Campaign name is required.'
    });
    return;
  }
  if (name.trim().length > 150) {
    res.status(400).json({
      success: false,
      error: 'Campaign name cannot exceed 150 characters.'
    });
    return;
  }

  // 2. templateId validation
  if (!templateId || typeof templateId !== 'string' || !Types.ObjectId.isValid(templateId)) {
    res.status(400).json({
      success: false,
      error: 'A valid email template ID ("templateId") is required.'
    });
    return;
  }

  // 3. Optional description validation
  if (description !== undefined && description !== null && typeof description !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Description must be a string.'
    });
    return;
  }
  if (description && description.trim().length > 1000) {
    res.status(400).json({
      success: false,
      error: 'Description cannot exceed 1000 characters.'
    });
    return;
  }

  // 4. Optional status validation
  if (status !== undefined && status !== null && status !== '') {
    if (!CAMPAIGN_STATUS_VALUES.includes(status as CampaignStatus)) {
      res.status(400).json({
        success: false,
        error: `Status must be one of: ${CAMPAIGN_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  req.body = {
    name: name.trim(),
    templateId: templateId.trim(),
    description: description && description.trim().length > 0 ? description.trim() : undefined,
    status: status ? (status as CampaignStatus) : 'draft'
  };

  next();
};

/**
 * Validates body for PATCH /api/campaigns/:id.
 */
export const validateUpdateCampaign = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one field must be provided for update.'
    });
    return;
  }

  // Reject protected fields
  for (const field of PROTECTED_FIELDS) {
    if (field in req.body) {
      res.status(400).json({
        success: false,
        error: `Field "${field}" cannot be modified directly.`
      });
      return;
    }
  }

  const { name, description, templateId, status } = req.body;
  const sanitizedUpdate: Record<string, any> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Campaign name cannot be empty.' });
      return;
    }
    if (name.trim().length > 150) {
      res.status(400).json({ success: false, error: 'Campaign name cannot exceed 150 characters.' });
      return;
    }
    sanitizedUpdate.name = name.trim();
  }

  if (templateId !== undefined) {
    if (typeof templateId !== 'string' || !Types.ObjectId.isValid(templateId)) {
      res.status(400).json({ success: false, error: 'Invalid templateId format.' });
      return;
    }
    sanitizedUpdate.templateId = templateId.trim();
  }

  if (description !== undefined) {
    if (description === null || description === '') {
      sanitizedUpdate.description = undefined;
    } else {
      if (typeof description !== 'string') {
        res.status(400).json({ success: false, error: 'Description must be a string.' });
        return;
      }
      if (description.trim().length > 1000) {
        res.status(400).json({ success: false, error: 'Description cannot exceed 1000 characters.' });
        return;
      }
      sanitizedUpdate.description = description.trim();
    }
  }

  if (status !== undefined) {
    if (!CAMPAIGN_STATUS_VALUES.includes(status as CampaignStatus)) {
      res.status(400).json({
        success: false,
        error: `Status must be one of: ${CAMPAIGN_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
    sanitizedUpdate.status = status;
  }

  if (Object.keys(sanitizedUpdate).length === 0) {
    res.status(400).json({
      success: false,
      error: 'No valid fields provided for update.'
    });
    return;
  }

  req.body = sanitizedUpdate;
  next();
};

/**
 * Validates body for POST /api/campaigns/:id/leads.
 */
export const validateAssociateLeads = (req: Request, res: Response, next: NextFunction): void => {
  const { leadIds } = req.body || {};

  if (!Array.isArray(leadIds)) {
    res.status(400).json({
      success: false,
      error: 'Request body must contain a "leadIds" array.'
    });
    return;
  }

  if (leadIds.length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one lead ID must be provided in "leadIds".'
    });
    return;
  }

  if (leadIds.length > 1000) {
    res.status(400).json({
      success: false,
      error: 'Maximum 1000 lead IDs can be associated per request.'
    });
    return;
  }

  const validIds: string[] = [];
  for (const id of leadIds) {
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: `Invalid lead ID format encountered: "${id}".`
      });
      return;
    }
    validIds.push(id.trim());
  }

  req.body = {
    leadIds: validIds
  };

  next();
};

/**
 * Validates query parameters for GET /api/campaigns.
 */
export const validateCampaignQuery = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit, status, search, sortBy, sortOrder } = req.query;

  let parsedPage = 1;
  if (page !== undefined) {
    parsedPage = parseInt(page as string, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "page" must be a positive integer.'
      });
      return;
    }
  }

  let parsedLimit = 10;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "limit" must be between 1 and 100.'
      });
      return;
    }
  }

  if (status !== undefined && status !== '') {
    if (!CAMPAIGN_STATUS_VALUES.includes(status as CampaignStatus)) {
      res.status(400).json({
        success: false,
        error: `Status filter must be one of: ${CAMPAIGN_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  const chosenSortBy = sortBy ? (sortBy as string) : 'createdAt';
  if (!ALLOWED_SORT_FIELDS.includes(chosenSortBy)) {
    res.status(400).json({
      success: false,
      error: `sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}.`
    });
    return;
  }

  const chosenSortOrder = sortOrder ? (sortOrder as string).toLowerCase() : 'desc';
  if (chosenSortOrder !== 'asc' && chosenSortOrder !== 'desc') {
    res.status(400).json({
      success: false,
      error: 'sortOrder must be either "asc" or "desc".'
    });
    return;
  }

  (req as any).campaignQuery = {
    page: parsedPage,
    limit: parsedLimit,
    status: status ? (status as CampaignStatus) : undefined,
    search: typeof search === 'string' && search.trim().length > 0 ? search.trim() : undefined,
    sortBy: chosenSortBy,
    sortOrder: chosenSortOrder as 'asc' | 'desc'
  };

  next();
};
