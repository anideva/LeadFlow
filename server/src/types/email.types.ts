export type EmailRecipient = string | string[];

export interface SendEmailOptions {
  to: EmailRecipient;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface EmailSender {
  name: string;
  address: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  accepted?: string[];
  rejected?: string[];
}

export interface IEmailProvider {
  readonly name: string;
  sendEmail(options: SendEmailOptions, from: EmailSender): Promise<EmailSendResult>;
  verifyConnection?(): Promise<boolean>;
}
