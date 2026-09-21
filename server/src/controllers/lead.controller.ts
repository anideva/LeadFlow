import { Request, Response } from 'express';
import { LeadService, LeadQueryOptions } from '../services/lead.service';
import { AppError } from '../utils/error.util';
import {
  BulkOperationSanitized,
  LeadExportQuerySanitized
} from '../validators/lead.validator';

export const createLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const lead = await LeadService.createLead(user.workspaceId, user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Lead created successfully.',
      data: lead
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - Create] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead.' });
  }
};

export const getLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const options = (req as any).leadQuery as LeadQueryOptions;

    const result = await LeadService.listLeads(user.workspaceId, options);

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

    console.error('[Lead Controller - List] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve leads.' });
  }
};

export const getLeadById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const lead = await LeadService.getLeadById(user.workspaceId, req.params.id);

    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - GetById] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve lead.' });
  }
};

export const updateLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const lead = await LeadService.updateLead(user.workspaceId, req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully.',
      data: lead
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - Update] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead.' });
  }
};

export const archiveLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await LeadService.archiveLead(user.workspaceId, req.params.id);

    res.status(200).json({
      success: true,
      message: 'Lead archived successfully.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - Archive] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive lead.' });
  }
};

export const bulkUpdateLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const operation = (req as any).bulkOperation as BulkOperationSanitized;

    const result = await LeadService.bulkLeadOperation(user.workspaceId, operation);

    res.status(200).json({
      success: true,
      message: `Bulk ${result.operation} completed successfully.`,
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - Bulk] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to process bulk operation.' });
  }
};

export const exportLeadsCsv = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const exportQuery = (req as any).leadExportQuery as LeadExportQuerySanitized;

    const { csv, count, filename } = await LeadService.exportLeads(user.workspaceId, exportQuery);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Lead Controller - Export] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to export leads as CSV.' });
  }
};

