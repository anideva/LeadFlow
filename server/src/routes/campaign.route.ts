import { Router } from 'express';
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  archiveCampaign,
  associateLeads
} from '../controllers/campaign.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateCreateCampaign,
  validateUpdateCampaign,
  validateCampaignQuery,
  validateCampaignObjectId,
  validateAssociateLeads
} from '../validators/campaign.validator';

const router = Router();

// All campaign endpoints require authentication
router.use(requireAuth);

router.post('/', validateCreateCampaign, createCampaign);
router.get('/', validateCampaignQuery, getCampaigns);
router.get('/:id', validateCampaignObjectId, getCampaignById);
router.patch('/:id', validateCampaignObjectId, validateUpdateCampaign, updateCampaign);
router.delete('/:id', validateCampaignObjectId, archiveCampaign);
router.post('/:id/leads', validateCampaignObjectId, validateAssociateLeads, associateLeads);

export default router;
