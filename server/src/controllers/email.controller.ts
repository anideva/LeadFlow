import { Request, Response } from 'express';
import { emailService } from '../services/email';
import { AppError } from '../utils/error.util';

export const sendTestEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, subject, text, html } = req.body;

    const result = await emailService.sendEmail({
      to,
      subject,
      text,
      html
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully.',
      data: {
        messageId: result.messageId,
        provider: result.provider,
        accepted: result.accepted
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
      return;
    }

    console.error('[Email Controller] Error sending test email:', error instanceof Error ? error.message : error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email.'
    });
  }
};
