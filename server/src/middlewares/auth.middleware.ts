import { Request, Response, NextFunction } from 'express';
import { AUTH_COOKIE_NAME } from '../constants/auth.constants';
import { verifyAuthToken } from '../utils/jwt.util';
import { User } from '../models/User.model';

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Read token exclusively from HTTP-only cookie
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
      return;
    }

    // 2. Verify JWT and extract payload
    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please log in again.'
      });
      return;
    }

    // 3. Load active user from database to ensure account is valid
    const user = await User.findById(payload.userId).select('-passwordHash').lean();

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User account not found or no longer active.'
      });
      return;
    }

    // 4. Attach typed authenticated user to Express request for downstream handlers
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId.toString()
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware] Unexpected error during authentication:', error);
    res.status(500).json({
      success: false,
      error: 'An internal authentication error occurred.'
    });
  }
};
