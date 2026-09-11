import { Router } from 'express';
import { importCsv } from '../controllers/lead-ingestion.controller';
import { uploadCsvMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Endpoint: POST /api/leads/import/csv
router.post('/csv', uploadCsvMiddleware, importCsv);

export default router;
