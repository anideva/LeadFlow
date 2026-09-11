export interface EmailConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromName: string;
  fromAddress?: string;
  isConfigured: boolean;
}

/**
 * Loads and returns the typed email configuration from environment variables.
 * Safe for development startup: does not throw if email credentials are absent.
 */
export const getEmailConfig = (): EmailConfig => {
  const host = process.env.EMAIL_HOST?.trim() || undefined;
  const portStr = process.env.EMAIL_PORT?.trim();
  const port = portStr ? parseInt(portStr, 10) : 587;
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user = process.env.EMAIL_USER?.trim() || undefined;
  const password = process.env.EMAIL_PASSWORD || undefined;
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'LeadFlow';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || undefined;

  const isConfigured = Boolean(
    host &&
    host.length > 0 &&
    user &&
    user.length > 0 &&
    password &&
    password.length > 0 &&
    fromAddress &&
    fromAddress.length > 0
  );

  return {
    host,
    port: isNaN(port) ? 587 : port,
    secure,
    user,
    password,
    fromName,
    fromAddress,
    isConfigured
  };
};
