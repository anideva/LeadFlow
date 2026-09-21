import { Router } from 'express';
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  archiveLead,
  bulkUpdateLeads,
  exportLeadsCsv
} from '../controllers/lead.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateCreateLead,
  validateUpdateLead,
  validateLeadQuery,
  validateObjectId,
  validateBulkLeadOperation,
  validateLeadExportQuery
} from '../validators/lead.validator';
import leadIngestionRoutes from './lead-ingestion.route';

const router = Router();

// All Lead CRM endpoints require authentication
router.use(requireAuth);

// Lead Ingestion routes (e.g. POST /api/leads/import/csv)
router.use('/import', leadIngestionRoutes);

router.post('/', validateCreateLead, createLead);
router.get('/', validateLeadQuery, getLeads);
router.get('/export', validateLeadExportQuery, exportLeadsCsv);
router.patch('/bulk', validateBulkLeadOperation, bulkUpdateLeads);
router.get('/:id', validateObjectId, getLeadById);
router.patch('/:id', validateObjectId, validateUpdateLead, updateLead);
router.delete('/:id', validateObjectId, archiveLead);

export default router;
