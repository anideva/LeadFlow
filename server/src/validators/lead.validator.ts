import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { LEAD_STATUS_VALUES, LEAD_PRIORITY_VALUES, LeadStatus, LeadPriority } from '../models/Lead.model';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROTECTED_FIELDS = ['_id', 'workspaceId', 'createdBy', 'isArchived', 'createdAt', 'updatedAt'];
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'company', 'status', 'priority'];

/**
 * Validates MongoDB ObjectId param (e.g., /api/leads/:id).
 */
export const validateObjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid lead ID format.'
    });
    return;
  }

  next();
};

/**
 * Validates request body for POST /api/leads.
 */
export const validateCreateLead = (req: Request, res: Response, next: NextFunction): void => {
  const {
    firstName,
    lastName,
    email,
    phone,
    company,
    source,
    status,
    priority,
    notes
  } = req.body;

  // 1. firstName is strictly required
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'First name is required.'
    });
    return;
  }

  // 2. Email format validation if provided
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.'
      });
      return;
    }
  }

  // 3. Status enum validation if provided
  if (status !== undefined && status !== null && status !== '') {
    if (!LEAD_STATUS_VALUES.includes(status as LeadStatus)) {
      res.status(400).json({
        success: false,
        error: `Status must be one of: ${LEAD_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  // 4. Priority enum validation if provided
  if (priority !== undefined && priority !== null && priority !== '') {
    if (!LEAD_PRIORITY_VALUES.includes(priority as LeadPriority)) {
      res.status(400).json({
        success: false,
        error: `Priority must be one of: ${LEAD_PRIORITY_VALUES.join(', ')}.`
      });
      return;
    }
  }

  // 5. Type validation for optional string fields
  if (lastName !== undefined && lastName !== null && typeof lastName !== 'string') {
    res.status(400).json({ success: false, error: 'Last name must be a string.' });
    return;
  }
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'Phone must be a string.' });
    return;
  }
  if (company !== undefined && company !== null && typeof company !== 'string') {
    res.status(400).json({ success: false, error: 'Company must be a string.' });
    return;
  }
  if (source !== undefined && source !== null && typeof source !== 'string') {
    res.status(400).json({ success: false, error: 'Source must be a string.' });
    return;
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    res.status(400).json({ success: false, error: 'Notes must be a string.' });
    return;
  }

  // Normalize inputs onto a clean sanitized body
  req.body = {
    firstName: firstName.trim(),
    lastName: lastName ? lastName.trim() : undefined,
    email: email && email.trim() ? email.trim().toLowerCase() : undefined,
    phone: phone ? phone.trim() : undefined,
    company: company ? company.trim() : undefined,
    source: source ? source.trim() : undefined,
    status: status ? (status as LeadStatus) : undefined,
    priority: priority ? (priority as LeadPriority) : undefined,
    notes: notes ? notes.trim() : undefined
  };

  next();
};

/**
 * Validates request body for PATCH /api/leads/:id.
 */
export const validateUpdateLead = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    res.status(400).json({
      success: false,
      error: 'At least one field must be provided for update.'
    });
    return;
  }

  // 1. Explicitly reject attempts to modify protected fields
  for (const field of PROTECTED_FIELDS) {
    if (field in req.body) {
      res.status(400).json({
        success: false,
        error: `Field "${field}" cannot be modified directly.`
      });
      return;
    }
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    company,
    source,
    status,
    priority,
    notes
  } = req.body;

  const sanitizedUpdate: Record<string, any> = {};

  // 2. Validate fields that were explicitly supplied
  if (firstName !== undefined) {
    if (typeof firstName !== 'string' || firstName.trim().length === 0) {
      res.status(400).json({ success: false, error: 'First name cannot be empty.' });
      return;
    }
    sanitizedUpdate.firstName = firstName.trim();
  }

  if (lastName !== undefined) {
    if (typeof lastName !== 'string') {
      res.status(400).json({ success: false, error: 'Last name must be a string.' });
      return;
    }
    sanitizedUpdate.lastName = lastName.trim();
  }

  if (email !== undefined) {
    if (email === null || email === '') {
      sanitizedUpdate.email = undefined;
    } else {
      if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
        res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
        return;
      }
      sanitizedUpdate.email = email.trim().toLowerCase();
    }
  }

  if (phone !== undefined) {
    if (typeof phone !== 'string') {
      res.status(400).json({ success: false, error: 'Phone must be a string.' });
      return;
    }
    sanitizedUpdate.phone = phone.trim();
  }

  if (company !== undefined) {
    if (typeof company !== 'string') {
      res.status(400).json({ success: false, error: 'Company must be a string.' });
      return;
    }
    sanitizedUpdate.company = company.trim();
  }

  if (source !== undefined) {
    if (typeof source !== 'string') {
      res.status(400).json({ success: false, error: 'Source must be a string.' });
      return;
    }
    sanitizedUpdate.source = source.trim();
  }

  if (status !== undefined) {
    if (!LEAD_STATUS_VALUES.includes(status as LeadStatus)) {
      res.status(400).json({
        success: false,
        error: `Status must be one of: ${LEAD_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
    sanitizedUpdate.status = status;
  }

  if (priority !== undefined) {
    if (!LEAD_PRIORITY_VALUES.includes(priority as LeadPriority)) {
      res.status(400).json({
        success: false,
        error: `Priority must be one of: ${LEAD_PRIORITY_VALUES.join(', ')}.`
      });
      return;
    }
    sanitizedUpdate.priority = priority;
  }

  if (notes !== undefined) {
    if (typeof notes !== 'string') {
      res.status(400).json({ success: false, error: 'Notes must be a string.' });
      return;
    }
    sanitizedUpdate.notes = notes.trim();
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
 * Validates query parameters for GET /api/leads.
 */
export const validateLeadQuery = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit, search, status, priority, source, sortBy, sortOrder } = req.query;

  // 1. Page validation
  let parsedPage = 1;
  if (page !== undefined) {
    parsedPage = parseInt(page as string, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "page" must be a positive integer greater than or equal to 1.'
      });
      return;
    }
  }

  // 2. Limit validation
  let parsedLimit = 10;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({
        success: false,
        error: 'Query parameter "limit" must be an integer between 1 and 100.'
      });
      return;
    }
  }

  // 3. Status filter validation
  if (status !== undefined && status !== '') {
    if (!LEAD_STATUS_VALUES.includes(status as LeadStatus)) {
      res.status(400).json({
        success: false,
        error: `Status filter must be one of: ${LEAD_STATUS_VALUES.join(', ')}.`
      });
      return;
    }
  }

  // 4. Priority filter validation
  if (priority !== undefined && priority !== '') {
    if (!LEAD_PRIORITY_VALUES.includes(priority as LeadPriority)) {
      res.status(400).json({
        success: false,
        error: `Priority filter must be one of: ${LEAD_PRIORITY_VALUES.join(', ')}.`
      });
      return;
    }
  }

  // 5. SortBy validation
  const chosenSortBy = sortBy ? (sortBy as string) : 'createdAt';
  if (!ALLOWED_SORT_FIELDS.includes(chosenSortBy)) {
    res.status(400).json({
      success: false,
      error: `sortBy must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}.`
    });
    return;
  }

  // 6. SortOrder validation
  const chosenSortOrder = sortOrder ? (sortOrder as string).toLowerCase() : 'desc';
  if (chosenSortOrder !== 'asc' && chosenSortOrder !== 'desc') {
    res.status(400).json({
      success: false,
      error: 'sortOrder must be either "asc" or "desc".'
    });
    return;
  }

  // Attach sanitized query options
  (req as any).leadQuery = {
    page: parsedPage,
    limit: parsedLimit,
    search: typeof search === 'string' && search.trim().length > 0 ? search.trim() : undefined,
    status: status ? (status as LeadStatus) : undefined,
    priority: priority ? (priority as LeadPriority) : undefined,
    source: typeof source === 'string' && source.trim().length > 0 ? source.trim() : undefined,
    sortBy: chosenSortBy,
    sortOrder: chosenSortOrder as 'asc' | 'desc'
  };

  next();
};
