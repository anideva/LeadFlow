import { Router } from 'express';
import {
  createWorkflow,
  getWorkflows,
  getWorkflowById,
  updateWorkflow,
  archiveWorkflow,
  testWorkflowExecution
} from '../controllers/workflow.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  validateCreateWorkflow,
  validateUpdateWorkflow,
  validateWorkflowQuery,
  validateWorkflowObjectId,
  validateTestWorkflow
} from '../validators/workflow.validator';

const router = Router();

// All workflow endpoints require authentication
router.use(requireAuth);

router.post('/', validateCreateWorkflow, createWorkflow);
router.get('/', validateWorkflowQuery, getWorkflows);
router.get('/:id', validateWorkflowObjectId, getWorkflowById);
router.patch('/:id', validateWorkflowObjectId, validateUpdateWorkflow, updateWorkflow);
router.delete('/:id', validateWorkflowObjectId, archiveWorkflow);
router.post('/:id/test', validateWorkflowObjectId, validateTestWorkflow, testWorkflowExecution);

export default router;
