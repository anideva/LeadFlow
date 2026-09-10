import jwt, { SignOptions, JsonWebTokenError } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthTokenPayload {
  userId: string;
  workspaceId: string;
  role: 'admin' | 'member';
}

/**
 * Signs a JWT with the user's ID, workspace ID, and role.
 */
export const signAuthToken = (payload: AuthTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

/**
 * Verifies a JWT and strictly validates the payload structure without blindly trusting casts.
 * Throws JsonWebTokenError if signature is invalid or claims are malformed,
 * or TokenExpiredError if expired.
 */
export const verifyAuthToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded !== 'object' || decoded === null) {
    throw new JsonWebTokenError('Invalid token payload: expected an object');
  }

  const claims = decoded as Record<string, unknown>;

  if (typeof claims.userId !== 'string' || claims.userId.trim() === '') {
    throw new JsonWebTokenError('Invalid token payload: missing or invalid userId');
  }

  if (typeof claims.workspaceId !== 'string' || claims.workspaceId.trim() === '') {
    throw new JsonWebTokenError('Invalid token payload: missing or invalid workspaceId');
  }

  if (claims.role !== 'admin' && claims.role !== 'member') {
    throw new JsonWebTokenError('Invalid token payload: role must be "admin" or "member"');
  }

  return {
    userId: claims.userId.trim(),
    workspaceId: claims.workspaceId.trim(),
    role: claims.role
  };
};
