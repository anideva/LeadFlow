import { EmailService } from './email.service';

export * from '../../types/email.types';
export * from './email.service';
export * from './providers/smtp.provider';

export const emailService = new EmailService();
