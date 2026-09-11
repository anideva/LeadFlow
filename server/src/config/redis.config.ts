import type { RedisOptions } from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
  isConfigured: boolean;
}

/**
 * Returns strongly-typed Redis configuration loaded from environment variables.
 */
export const getRedisConfig = (): RedisConfig => {
  const host = process.env.REDIS_HOST?.trim() || '127.0.0.1';
  const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  const password = process.env.REDIS_PASSWORD?.trim() || undefined;
  const isTls = process.env.REDIS_TLS === 'true';

  // Considered configured if REDIS_HOST or REDIS_PORT is explicitly set in .env
  const isConfigured = Boolean(process.env.REDIS_HOST || process.env.REDIS_PORT);

  return {
    host,
    port: isNaN(port) ? 6379 : port,
    password,
    tls: isTls,
    isConfigured
  };
};

/**
 * Generates connection options formatted for BullMQ and ioredis.
 * Enforces strict TLS verification when TLS is enabled (no insecure bypasses).
 * BullMQ requires maxRetriesPerRequest to be null on connection options.
 */
export const getRedisConnectionOptions = (): RedisOptions => {
  const config = getRedisConfig();

  const options: RedisOptions = {
    host: config.host,
    port: config.port,
    password: config.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 2000,
    retryStrategy: (times: number) => {
      // If Redis is unconfigured or fails 3 times, stop reconnecting to avoid runaway loops
      if (!config.isConfigured || times > 3) {
        return null;
      }
      return Math.min(times * 500, 2000);
    }
  };

  if (config.tls) {
    // Normal TLS verification with strict certificates
    options.tls = {
      rejectUnauthorized: true
    };
  }

  return options;
};
