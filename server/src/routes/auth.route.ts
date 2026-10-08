import { Router } from 'express';
import { register, login, logout, me, verifyEmail, resendVerification, googleAuth } from '../controllers/auth.controller';
import {
  validateRegisterInput,
  validateLoginInput,
  validateVerifyEmailInput,
  validateResendVerificationInput,
  validateGoogleAuthInput
} from '../validators/auth.validator';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', validateRegisterInput, register);
router.post('/login', validateLoginInput, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/verify-email', validateVerifyEmailInput, verifyEmail);
router.post('/resend-verification', validateResendVerificationInput, resendVerification);
router.post('/google', validateGoogleAuthInput, googleAuth);

export default router;
