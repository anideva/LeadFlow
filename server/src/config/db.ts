import mongoose from 'mongoose';
import dns from 'node:dns';
import { env } from './env';

// If SRV record resolution fails on local ISP DNS, fallback to public DNS
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // Ignore if running in an environment where setServers is restricted
}

export const connectDB = async (): Promise<typeof mongoose> => {
  try {
    // Setup connection event listeners before connecting
    mongoose.connection.on('connected', () => {
      const host = mongoose.connection.host;
      const dbName = mongoose.connection.name;
      console.log(`[Database] Connected successfully to MongoDB: ${host}/${dbName}`);
    });

    mongoose.connection.on('error', (err) => {
      console.error('[Database] MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] MongoDB disconnected');
    });

    // Graceful process termination handlers
    const gracefulExit = async () => {
      try {
        await mongoose.connection.close();
        console.log('[Database] MongoDB connection closed due to application termination');
        process.exit(0);
      } catch (err) {
        console.error('[Database] Error closing MongoDB connection:', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', gracefulExit);
    process.on('SIGTERM', gracefulExit);

    // Connection options:
    // - serverSelectionTimeoutMS: 5000 prevents long stalls on unreachable databases.
    // - tlsAllowInvalidCertificates: Strictly restricted to development (NODE_ENV === 'development')
    //   to resolve Windows local network/antivirus TLS leaf certificate inspection
    //   (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Production NEVER disables TLS certificate validation.
    const isDevelopment = env.NODE_ENV === 'development';
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      tlsAllowInvalidCertificates: isDevelopment
    });
    return conn;
  } catch (error) {
    console.error('[Database] Failed to establish initial MongoDB connection:', error);
    throw error;
  }
};
