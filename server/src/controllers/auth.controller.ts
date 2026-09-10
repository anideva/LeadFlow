import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AUTH_COOKIE_NAME, getAuthCookieOptions, getClearAuthCookieOptions } from '../constants/auth.constants';
import { AppError } from '../utils/error.util';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, workspaceName } = req.body;

    const result = await AuthService.register({
      name,
      email,
      password,
      workspaceName
    });

    // Attach JWT inside secure HTTP-only cookie
    res.cookie(AUTH_COOKIE_NAME, result.token, getAuthCookieOptions());

    res.status(201).json({
      success: true,
      message: 'User registered and workspace created successfully.',
      data: {
        user: result.user,
        workspace: result.workspace
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

    console.error('[Auth Controller - Register] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during registration.'
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const result = await AuthService.login({
      email,
      password
    });

    // Attach JWT inside secure HTTP-only cookie
    res.cookie(AUTH_COOKIE_NAME, result.token, getAuthCookieOptions());

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: result.user,
        workspace: result.workspace
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

    console.error('[Auth Controller - Login] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during login.'
    });
  }
};

export const logout = (_req: Request, res: Response): void => {
  // Clear the authentication cookie
  res.clearCookie(AUTH_COOKIE_NAME, getClearAuthCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
      return;
    }

    const profile = await AuthService.getProfile(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: profile.user,
        workspace: profile.workspace
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

    console.error('[Auth Controller - Me] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred fetching current user.'
    });
  }
};
