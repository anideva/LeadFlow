import nodemailer, { Transporter } from 'nodemailer';
import { getEmailConfig, EmailConfig } from '../../../config/email.config';
import { IEmailProvider, SendEmailOptions, EmailSender, EmailSendResult } from '../../../types/email.types';
import { AppError } from '../../../utils/error.util';

export class SmtpEmailProvider implements IEmailProvider {
  public readonly name = 'smtp';
  private transporter: Transporter | null = null;
  private config: EmailConfig;

  constructor(customConfig?: EmailConfig) {
    this.config = customConfig || getEmailConfig();
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      if (!this.config.isConfigured) {
        throw new AppError(503, 'Email service is not configured. Please configure SMTP environment variables.');
      }

      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.password
        },
        // Strict TLS verification enforced: never disable certificate checks
        tls: {
          rejectUnauthorized: true
        }
      });
    }

    return this.transporter;
  }

  public async sendEmail(
    options: SendEmailOptions,
    from: EmailSender
  ): Promise<EmailSendResult> {
    const transporter = this.getTransporter();

    const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    try {
      const info = await transporter.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: toAddresses,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: this.name,
        accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
        rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : []
      };
    } catch (error: any) {
      // Sanitize and translate low-level SMTP errors without exposing credentials or internal host details
      if (error?.code === 'EAUTH') {
        throw new AppError(502, 'SMTP authentication failed. Please verify email credentials.');
      }

      if (error?.code === 'ESOCKET' || error?.code === 'ECONNREFUSED') {
        throw new AppError(502, 'Failed to connect to the SMTP server. Please verify EMAIL_HOST and EMAIL_PORT.');
      }

      if (error?.code === 'ETIMEDOUT') {
        throw new AppError(504, 'Connection to the SMTP server timed out.');
      }

      console.error('[SMTP Provider] Email delivery error:', error?.message || error);
      throw new AppError(502, `Email delivery failed: ${error?.message || 'Upstream provider error'}`);
    }
  }

  public async verifyConnection(): Promise<boolean> {
    const transporter = this.getTransporter();
    try {
      await transporter.verify();
      return true;
    } catch (error: any) {
      console.error('[SMTP Provider] Verification failed:', error?.message || error);
      return false;
    }
  }
}
