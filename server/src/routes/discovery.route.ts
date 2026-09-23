import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateDiscoverySearch,
  validateConvertProspect,
  validateEnrichProspect
} from '../validators/discovery.validator';
import {
  getDiscoveryConfig,
  searchProspects,
  convertProspect,
  enrichProspect
} from '../controllers/discovery.controller';

const router = Router();

// Enforce authentication on all discovery routes
router.use(requireAuth);

// GET /api/discovery/config - Retrieve discovery configuration flags (safe, no secrets)
router.get('/config', getDiscoveryConfig);

// POST /api/discovery/search - Discover prospects using natural language query
router.post('/search', validateDiscoverySearch, searchProspects);


// POST /api/discovery/enrich - Enrich prospect details from its official website
router.post('/enrich', validateEnrichProspect, enrichProspect);

// POST /api/discovery/convert - Convert discovered prospect into a LeadFlow CRM lead
router.post('/convert', validateConvertProspect, convertProspect);

export default router;
