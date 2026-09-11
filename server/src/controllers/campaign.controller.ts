import { Request, Response } from 'express';
import { CampaignService, CampaignQueryOptions } from '../services/campaign.service';
import { AppError } from '../utils/error.util';

export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const campaign = await CampaignService.createCampaign(user.workspaceId, user.id, req.body);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      data: campaign
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Campaign Controller - Create] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign.' });
  }
};

export const getCampaigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const options = (req as any).campaignQuery as CampaignQueryOptions;

    const result = await CampaignService.listCampaigns(user.workspaceId, options);

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

    console.error('[Campaign Controller - List] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve campaigns.' });
  }
};

export const getCampaignById = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const campaign = await CampaignService.getCampaignById(user.workspaceId, req.params.id);

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Campaign Controller - GetById] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve campaign.' });
  }
};

export const updateCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const campaign = await CampaignService.updateCampaign(
      user.workspaceId,
      req.params.id,
      user.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Campaign updated successfully.',
      data: campaign
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Campaign Controller - Update] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update campaign.' });
  }
};

export const archiveCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await CampaignService.archiveCampaign(
      user.workspaceId,
      req.params.id,
      user.id
    );

    res.status(200).json({
      success: true,
      message: 'Campaign archived successfully.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Campaign Controller - Archive] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive campaign.' });
  }
};

export const associateLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const result = await CampaignService.associateLeads(
      user.workspaceId,
      req.params.id,
      req.body.leadIds
    );

    res.status(200).json({
      success: true,
      message: 'Leads associated with campaign successfully.',
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }

    console.error('[Campaign Controller - AssociateLeads] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to associate leads with campaign.' });
  }
};
