import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  extractAllTemplateVariables,
  SUPPORTED_TEMPLATE_VARIABLES
} from '../utils/template-renderer.util';

const PROTECTED_FIELDS = ['_id', 'workspaceId', 'createdBy', 'isArchived', 'createdAt', 'updatedAt'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'subject'];

/**
 * Validates template ID parameter format.
 */
export const validateTemplateObjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid template ID format.'
    });
    return;
  }

  next();
};

/**
 * Validates body for POST /api/email-templates.
 */
export const validateCreateEmailTemplate = (req: Request, res: Response, next: NextFunction): void => {
  const { name, subject, htmlBody, textBody } = req.body || {};

  // 1. Name validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Template name is required.'
    });
    return;
  }
  if (name.trim().length > 150) {
    res.status(400).json({
      success: false,
      error: 'Template name cannot exceed 150 characters.'
    });
    return;
  }

  // 2. Subject validation
  if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Subject line is required.'
    });
    return;
  }
  if (subject.trim().length > 300) {
    res.status(400).json({
      success: false,
      error: 'Subject line cannot exceed 300 characters.'
    });
    return;
  }

  // 3. HTML body validation
  if (!htmlBody || typeof htmlBody !== 'string' || htmlBody.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'HTML body is required.'
    });
    return;
  }

  // 4. Text body optional validation
  if (textBody !== undefined && textBody !== null && typeof textBody !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Text body must be a string.'
    });
    return;
  }

  // 5. Template variables validation (scanning subject, htmlBody, and textBody)
  const { supported, unsupported } = extractAllTemplateVariables([subject, htmlBody, textBody]);

  if (unsupported.length > 0) {
    res.status(400).json({
      success: false,
      error: `Unsupported template variable(s): {{${unsupported.join('}}, {{')}}}. Supported variables are: {{${SUPPORTED_TEMPLATE_VARIABLES.join('}}, {{')}}}.`
    });
    return;
  }

  // Sanitize and attach variables
  req.body = {
    name: name.trim(),
    subject: subject.trim(),
    htmlBody: htmlBody.trim(),
    textBody: textBody && textBody.trim().length > 0 ? textBody.trim() : undefined,
    variables: supported
  };

  next();
};

/**
 * Validates body for PATCH /api/email-templates/:id.
 */
export const validateUpdateEmailTemplate = (req: Request, res: Response, next: NextFunction): void => {
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

  const { name, subject, htmlBody, textBody } = req.body;
  const sanitizedUpdate: Record<string, any> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Template name cannot be empty.' });
      return;
    }
    if (name.trim().length > 150) {
      res.status(400).json({ success: false, error: 'Template name cannot exceed 150 characters.' });
      return;
    }
    sanitizedUpdate.name = name.trim();
  }

  if (subject !== undefined) {
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Subject line cannot be empty.' });
      return;
    }
    if (subject.trim().length > 300) {
      res.status(400).json({ success: false, error: 'Subject line cannot exceed 300 characters.' });
      return;
    }
    sanitizedUpdate.subject = subject.trim();
  }

  if (htmlBody !== undefined) {
    if (typeof htmlBody !== 'string' || htmlBody.trim().length === 0) {
      res.status(400).json({ success: false, error: 'HTML body cannot be empty.' });
      return;
    }
    sanitizedUpdate.htmlBody = htmlBody.trim();
  }

  if (textBody !== undefined) {
    if (textBody === null || textBody === '') {
      sanitizedUpdate.textBody = undefined;
    } else {
      if (typeof textBody !== 'string') {
        res.status(400).json({ success: false, error: 'Text body must be a string.' });
        return;
      }
      sanitizedUpdate.textBody = textBody.trim();
    }
  }

  // If subject, htmlBody, or textBody are being updated, check variables
  const fieldsToCheck = [sanitizedUpdate.subject, sanitizedUpdate.htmlBody, sanitizedUpdate.textBody].filter(Boolean);
  if (fieldsToCheck.length > 0) {
    const { supported, unsupported } = extractAllTemplateVariables(fieldsToCheck);
    if (unsupported.length > 0) {
      res.status(400).json({
        success: false,
        error: `Unsupported template variable(s): {{${unsupported.join('}}, {{')}}}. Supported variables are: {{${SUPPORTED_TEMPLATE_VARIABLES.join('}}, {{')}}}.`
      });
      return;
    }
    sanitizedUpdate.variables = supported;
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
 * Validates query parameters for GET /api/email-templates.
 */
export const validateEmailTemplateQuery = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit, search, sortBy, sortOrder } = req.query;

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

  (req as any).templateQuery = {
    page: parsedPage,
    limit: parsedLimit,
    search: typeof search === 'string' && search.trim().length > 0 ? search.trim() : undefined,
    sortBy: chosenSortBy,
    sortOrder: chosenSortOrder as 'asc' | 'desc'
  };

  next();
};
