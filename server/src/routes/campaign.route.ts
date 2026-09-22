import { Router } from 'express';
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  archiveCampaign,
  associateLeads,
  getCampaignLeads,
  removeCampaignLead,
  getCampaignStats,
  sendCampaign
} from '../controllers/campaign.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateCreateCampaign,
  validateUpdateCampaign,
  validateCampaignQuery,
  validateCampaignObjectId,
  validateAssociateLeads,
  validateCampaignLeadsQuery,
  validateCampaignAndLeadIds
} from '../validators/campaign.validator';

const router = Router();

// All campaign endpoints require authentication
router.use(requireAuth);

router.post('/', validateCreateCampaign, createCampaign);
router.get('/', validateCampaignQuery, getCampaigns);

// Campaign sub-resource routes
router.get('/:id/leads', validateCampaignObjectId, validateCampaignLeadsQuery, getCampaignLeads);
router.delete('/:id/leads/:leadId', validateCampaignAndLeadIds, removeCampaignLead);
router.post('/:id/leads', validateCampaignObjectId, validateAssociateLeads, associateLeads);
router.get('/:id/stats', validateCampaignObjectId, getCampaignStats);
router.post('/:id/send', validateCampaignObjectId, sendCampaign);

// Campaign single resource routes
router.get('/:id', validateCampaignObjectId, getCampaignById);
router.patch('/:id', validateCampaignObjectId, validateUpdateCampaign, updateCampaign);
router.delete('/:id', validateCampaignObjectId, archiveCampaign);

export default router;
