import dotenv from 'dotenv';

// Ensure .env is loaded
dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  CLIENT_URL: string;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
}

export const validateEnv = (): EnvConfig => {
  const rawUri = process.env.MONGODB_URI;

  if (!rawUri || rawUri.trim() === '') {
    console.error('\n=============================================================');
    console.error('[FATAL CONFIGURATION ERROR] Missing required environment variable:');
    console.error('  MONGODB_URI is not set in server/.env');
    console.error('  Please set MONGODB_URI in server/.env (see server/.env.example)');
    console.error('=============================================================\n');
    process.exit(1);
  }

  const trimmedUri = rawUri.trim();

  // Validate that it begins with a valid protocol
  if (!trimmedUri.startsWith('mongodb://') && !trimmedUri.startsWith('mongodb+srv://')) {
    console.error('\n=============================================================');
    console.error('[FATAL CONFIGURATION ERROR] Invalid MONGODB_URI:');
    console.error('  MONGODB_URI must begin with "mongodb://" or "mongodb+srv://"');
    console.error(`  Received: "${trimmedUri}"`);
    console.error('=============================================================\n');
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === '') {
    console.error('\n=============================================================');
    console.error('[FATAL CONFIGURATION ERROR] Missing required environment variable:');
    console.error('  JWT_SECRET is not set in server/.env');
    console.error('  Please set a secure JWT_SECRET in server/.env (see server/.env.example)');
    console.error('=============================================================\n');
    process.exit(1);
  }

  const portVal = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  if (isNaN(portVal)) {
    console.error(`\n[FATAL CONFIGURATION ERROR] Invalid PORT: "${process.env.PORT}". Must be a valid integer.\n`);
    process.exit(1);
  }

  const nodeEnv = (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return {
    PORT: portVal,
    NODE_ENV: nodeEnv,
    CLIENT_URL: clientUrl,
    MONGODB_URI: trimmedUri,
    JWT_SECRET: jwtSecret.trim(),
    JWT_EXPIRES_IN: jwtExpiresIn.trim()
  };
};

export const env: EnvConfig = validateEnv();
