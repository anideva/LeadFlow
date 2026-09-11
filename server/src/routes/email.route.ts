import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { validateTestEmail } from '../validators/email.validator';
import { sendTestEmail } from '../controllers/email.controller';

const router = Router();

// All email routes require authentication
router.use(requireAuth);

// Development test endpoint: POST /api/email/test
router.post('/test', validateTestEmail, sendTestEmail);

export default router;
