import { CookieOptions } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE_NAME = 'leadflow_token';

// 7 days in milliseconds
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Centralized, reusable cookie options for setting the authentication token.
 * Secure over HTTPS in production, functional over HTTP in local development.
 */
export const getAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
  path: '/'
});

/**
 * Cookie options used when clearing the auth cookie during logout.
 */
export const getClearAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/'
});
