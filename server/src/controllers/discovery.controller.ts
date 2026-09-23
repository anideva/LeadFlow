import { Request, Response } from 'express';
import { DiscoveryService } from '../services/discovery/discovery.service';
import { AppError } from '../utils/error.util';

export const getDiscoveryConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await DiscoveryService.getConfig(req.user?.workspaceId);
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[Discovery Controller - Config] Error:', error);
    res.status(200).json({
      success: true,
      data: {
        apifyEnabled: false,
        defaultProvider: 'osm_combined'
      }
    });
  }
};

export const searchProspects = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { query, limit, locationHint, cursor, provider } = req.body;

    const result = await DiscoveryService.search(user.workspaceId, user.id, {
      query,
      limit: limit ? Number(limit) : undefined,
      locationHint,
      cursor,
      provider: typeof provider === 'string' ? provider.trim() : undefined
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
      return;
    }


    console.error('[Discovery Controller - Search] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to discover prospects.' });
  }
};

export const convertProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { prospect } = req.body;

    const lead = await DiscoveryService.convertToLead(user.workspaceId, user.id, prospect);

    res.status(201).json({
      success: true,
      message: 'Prospect successfully converted to CRM lead.',
      data: lead
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Discovery Controller - Convert] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to convert prospect to lead.' });
  }
};

export const enrichProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { prospect, options } = req.body;

    const result = await DiscoveryService.enrich(user.workspaceId, user.id, {
      prospect,
      options
    });

    res.status(200).json({
      success: true,
      message: 'Prospect enriched successfully from website.',
      data: result.prospect,
      enrichment: result.enrichment
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Discovery Controller - Enrich] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to enrich prospect from website.' });
  }
};

