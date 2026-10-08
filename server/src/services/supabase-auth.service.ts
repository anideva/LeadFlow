import { env } from '../config/env';
import { AppError } from '../utils/error.util';

export interface SupabaseVerifiedUser {
  supabaseId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isEmailConfirmed: boolean;
}

export type SupabaseTokenVerifier = (accessToken: string) => Promise<SupabaseVerifiedUser>;

let tokenVerifierOverride: SupabaseTokenVerifier | null = null;

/**
 * Allows unit and integration tests to inject a mock verifier for offline, self-contained testing.
 */
export const setSupabaseTokenVerifierForTesting = (verifier: SupabaseTokenVerifier | null): void => {
  tokenVerifierOverride = verifier;
};

/**
 * Verifies a Supabase access token server-side via Supabase Auth REST API.
 * Ensures the token was issued by the configured Supabase project and that
 * the user's Google email address is strictly confirmed before account creation or linking.
 */
export async function verifySupabaseToken(accessToken: string): Promise<SupabaseVerifiedUser> {
  const trimmedToken = (accessToken || '').trim();
  if (!trimmedToken) {
    throw new AppError(400, 'Authentication token is required.');
  }

  // Use test override if injected
  if (tokenVerifierOverride) {
    return tokenVerifierOverride(trimmedToken);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AppError(503, 'Google authentication is currently unavailable: Supabase configuration is missing on this server.');
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
        apikey: supabaseAnonKey
      }
    });
  } catch (networkError: any) {
    console.error('[SupabaseAuth] Network failure verifying token:', networkError?.message || networkError);
    throw new AppError(502, 'Failed to communicate with authentication provider. Please try again.');
  }

  if (response.status === 401 || !response.ok) {
    throw new AppError(401, 'Invalid or expired Google authentication session. Please sign in again.');
  }

  const data: any = await response.json().catch(() => null);
  if (!data || !data.id || typeof data.email !== 'string') {
    throw new AppError(401, 'Malformed identity data returned from authentication provider.');
  }

  // Requirement: Verify that the Supabase/Google email is confirmed
  const isConfirmed = Boolean(
    data.email_confirmed_at ||
    data.confirmed_at ||
    data.user_metadata?.email_verified
  );

  if (!isConfirmed) {
    throw new AppError(400, 'Your Google email address has not been confirmed. Please verify your email with Google.');
  }

  const rawName =
    data.user_metadata?.full_name ||
    data.user_metadata?.name ||
    data.email.split('@')[0] ||
    'Google User';

  const avatarUrl =
    data.user_metadata?.avatar_url ||
    data.user_metadata?.picture ||
    undefined;

  return {
    supabaseId: data.id,
    email: data.email.toLowerCase().trim(),
    name: rawName.trim(),
    avatarUrl,
    isEmailConfirmed: true
  };
}
