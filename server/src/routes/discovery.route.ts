import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateDiscoverySearch,
  validateConvertProspect
} from '../validators/discovery.validator';
import {
  searchProspects,
  convertProspect
} from '../controllers/discovery.controller';

const router = Router();

// Enforce authentication on all discovery routes
router.use(requireAuth);

// POST /api/discovery/search - Discover prospects using natural language query
router.post('/search', validateDiscoverySearch, searchProspects);

// POST /api/discovery/convert - Convert discovered prospect into a LeadFlow CRM lead
router.post('/convert', validateConvertProspect, convertProspect);

export default router;
