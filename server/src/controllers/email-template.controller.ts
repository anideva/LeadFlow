import { Request, Response } from 'express';
import { EmailTemplateService, TemplateQueryOptions } from '../services/email-template.service';
import { AppError } from '../utils/error.util';

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const template = await EmailTemplateService.createTemplate(user.workspaceId, user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Email template created successfully.',
      data: template
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Email Template Controller - Create] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create email template.' });
  }
};

export const getTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const options = (req as any).templateQuery as TemplateQueryOptions;

    const result = await EmailTemplateService.listTemplates(user.workspaceId, options);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Email Template Controller - List] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve email templates.' });
  }
};

export const getTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const template = await EmailTemplateService.getTemplateById(user.workspaceId, req.params.id);

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Email Template Controller - GetById] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve email template.' });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const template = await EmailTemplateService.updateTemplate(
      user.workspaceId,
      req.params.id,
      user.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Email template updated successfully.',
      data: template
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Email Template Controller - Update] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update email template.' });
  }
};

export const archiveTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await EmailTemplateService.archiveTemplate(
      user.workspaceId,
      req.params.id,
      user.id
    );

    res.status(200).json({
      success: true,
      message: 'Email template archived successfully.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Email Template Controller - Archive] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive email template.' });
  }
};
