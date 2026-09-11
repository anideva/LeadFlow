import { IEmailProvider, SendEmailOptions, EmailSendResult, EmailSender } from '../../types/email.types';
import { SmtpEmailProvider } from './providers/smtp.provider';
import { getEmailConfig, EmailConfig } from '../../config/email.config';
import { AppError } from '../../utils/error.util';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailService {
  private provider: IEmailProvider;
  private config: EmailConfig;

  constructor(provider?: IEmailProvider, config?: EmailConfig) {
    this.config = config || getEmailConfig();
    this.provider = provider || new SmtpEmailProvider(this.config);
  }

  /**
   * Validates and normalizes email parameters before passing them to the configured provider.
   */
  public async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    // 1. Ensure email infrastructure is configured
    if (!this.config.isConfigured || !this.config.fromAddress) {
      throw new AppError(503, 'Email service is not configured. Please configure SMTP environment variables.');
    }

    // 2. Validate recipient(s)
    if (!options.to) {
      throw new AppError(400, 'Recipient email address ("to") is required.');
    }

    const recipients: string[] = Array.isArray(options.to) ? options.to : [options.to];

    if (recipients.length === 0) {
      throw new AppError(400, 'At least one recipient email address must be provided.');
    }

    const normalizedRecipients: string[] = [];
    for (const recipient of recipients) {
      if (typeof recipient !== 'string' || recipient.trim().length === 0) {
        throw new AppError(400, 'Recipient email address cannot be empty.');
      }
      const trimmed = recipient.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmed)) {
        throw new AppError(400, `Invalid recipient email address format: "${recipient}".`);
      }
      normalizedRecipients.push(trimmed);
    }

    // 3. Validate subject
    if (!options.subject || typeof options.subject !== 'string' || options.subject.trim().length === 0) {
      throw new AppError(400, 'Email subject is required.');
    }
    const normalizedSubject = options.subject.trim();

    // 4. Validate body content (at least text or html must be non-empty)
    const hasText = Boolean(options.text && typeof options.text === 'string' && options.text.trim().length > 0);
    const hasHtml = Boolean(options.html && typeof options.html === 'string' && options.html.trim().length > 0);

    if (!hasText && !hasHtml) {
      throw new AppError(400, 'Email content is required. Please provide either "text" or "html" body.');
    }

    // 5. Validate replyTo if provided
    let normalizedReplyTo: string | undefined = undefined;
    if (options.replyTo !== undefined && options.replyTo !== null && options.replyTo.trim() !== '') {
      const trimmedReplyTo = options.replyTo.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmedReplyTo)) {
        throw new AppError(400, `Invalid "replyTo" email address format: "${options.replyTo}".`);
      }
      normalizedReplyTo = trimmedReplyTo;
    }

    const from: EmailSender = {
      name: this.config.fromName,
      address: this.config.fromAddress
    };

    const normalizedOptions: SendEmailOptions = {
      to: normalizedRecipients.length === 1 ? normalizedRecipients[0] : normalizedRecipients,
      subject: normalizedSubject,
      text: options.text?.trim(),
      html: options.html?.trim(),
      replyTo: normalizedReplyTo
    };

    // 6. Invoke provider
    try {
      return await this.provider.sendEmail(normalizedOptions, from);
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      // Sanitize any accidental password/auth mentions from third-party provider messages
      const safeMessage = (error?.message || 'Upstream provider failure')
        .replace(/password\s*[:=]?\s*\S+/gi, 'password [REDACTED]')
        .replace(/pass\s*[:=]?\s*\S+/gi, 'pass [REDACTED]')
        .replace(/auth\s*[:=]?\s*\S+/gi, 'auth [REDACTED]');
      console.error(`[Email Service - ${this.provider.name}] Delivery failure:`, safeMessage);
      throw new AppError(502, `Email delivery failed: ${safeMessage}`);
    }
  }

  /**
   * Helper to inspect the active provider name.
   */
  public getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Helper to verify provider connection health where supported.
   */
  public async verifyConnection(): Promise<boolean> {
    if (!this.provider.verifyConnection) {
      return true;
    }
    return await this.provider.verifyConnection();
  }
}
