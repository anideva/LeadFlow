import { env } from './config/env';
import app from './app';
import { connectDB } from './config/db';

const server = app.listen(env.PORT, () => {
  console.log(`[LeadFlow Server] running on http://localhost:${env.PORT}`);
  console.log(`[LeadFlow Server] Environment: ${env.NODE_ENV}`);
  console.log(`[LeadFlow Server] Health check at http://localhost:${env.PORT}/api/health`);
});

// Establish MongoDB connection
connectDB().catch((error) => {
  console.error('[LeadFlow Server] Initial database connection attempt failed:', error.message);
});

export default server;
