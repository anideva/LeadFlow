import { Request, Response, NextFunction } from 'express';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateTestEmail = (req: Request, res: Response, next: NextFunction): void => {
  const { to, subject, text, html } = req.body || {};

  // 1. "to" recipient is strictly required
  if (!to || typeof to !== 'string' || to.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Recipient email address ("to") is required.'
    });
    return;
  }

  const trimmedTo = to.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedTo)) {
    res.status(400).json({
      success: false,
      error: 'Invalid recipient email address format.'
    });
    return;
  }

  // 2. Optional subject
  const sanitizedSubject = typeof subject === 'string' && subject.trim().length > 0
    ? subject.trim()
    : 'LeadFlow Email Infrastructure Test';

  // 3. Optional body content
  const sanitizedText = typeof text === 'string' && text.trim().length > 0
    ? text.trim()
    : (html ? undefined : 'This is a test message from the LeadFlow email infrastructure.');

  const sanitizedHtml = typeof html === 'string' && html.trim().length > 0
    ? html.trim()
    : undefined;

  // 4. Overwrite req.body with strictly whitelisted, sanitized fields
  // Never allow client-provided SMTP configuration, host, user, password, or sender override
  req.body = {
    to: trimmedTo,
    subject: sanitizedSubject,
    text: sanitizedText,
    html: sanitizedHtml
  };

  next();
};
