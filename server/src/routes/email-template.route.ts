import { Router } from 'express';
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  archiveTemplate
} from '../controllers/email-template.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateCreateEmailTemplate,
  validateUpdateEmailTemplate,
  validateEmailTemplateQuery,
  validateTemplateObjectId
} from '../validators/email-template.validator';

const router = Router();

// All email template endpoints require authentication
router.use(requireAuth);

router.post('/', validateCreateEmailTemplate, createTemplate);
router.get('/', validateEmailTemplateQuery, getTemplates);
router.get('/:id', validateTemplateObjectId, getTemplateById);
router.patch('/:id', validateTemplateObjectId, validateUpdateEmailTemplate, updateTemplate);
router.delete('/:id', validateTemplateObjectId, archiveTemplate);

export default router;
