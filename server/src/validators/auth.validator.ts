import { Request, Response, NextFunction } from 'express';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export const validateRegisterInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { name, email, password, workspaceName } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({
      success: false,
      error: 'Name must be at least 2 characters long.'
    });
    return;
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({
      success: false,
      error: 'Please provide a valid email address.'
    });
    return;
  }

  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      success: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
    });
    return;
  }

  if (!workspaceName || typeof workspaceName !== 'string' || workspaceName.trim().length < 2) {
    res.status(400).json({
      success: false,
      error: 'Workspace name must be at least 2 characters long.'
    });
    return;
  }

  next();
};

export const validateLoginInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({
      success: false,
      error: 'Please provide a valid email address.'
    });
    return;
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Password is required.'
    });
    return;
  }

  next();
};
