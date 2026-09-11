import { Request, Response } from 'express';
import { LeadIngestionService } from '../services/lead-ingestion.service';
import { AppError } from '../utils/error.util';

export const importCsv = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const file = req.file;

    if (!file || !file.buffer) {
      res.status(400).json({
        success: false,
        error: 'No CSV file provided.'
      });
      return;
    }

    const result = await LeadIngestionService.importCsv(
      user.workspaceId,
      user.id,
      file.buffer
    );

    res.status(200).json({
      success: true,
      message: 'CSV import completed.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
      return;
    }

    console.error('[Lead Ingestion Controller - Import CSV] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import CSV.'
    });
  }
};
