import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.controller';
import { validateRegisterInput, validateLoginInput } from '../validators/auth.validator';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', validateRegisterInput, register);
router.post('/login', validateLoginInput, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
