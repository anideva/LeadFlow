import type { Worker } from 'bullmq';
import { env } from './config/env';
import app from './app';
import { connectDB, disconnectDB } from './config/db';
import { getRedisConfig } from './config/redis.config';
import { createWorkflowWorker } from './workers/workflow.worker';
import { createCampaignWorker } from './workers/campaign.worker';
import { closeWorkflowQueue } from './queues/workflow.queue';
import { closeCampaignQueue } from './queues/campaign.queue';
import {
  setWorkflowWorkerInstance,
  setCampaignWorkerInstance
} from './workers/worker.registry';

let workflowWorker: Worker | null = null;
let campaignWorker: Worker | null = null;
let isShuttingDown = false;

const server = app.listen(env.PORT, () => {
  console.log(`[LeadFlow Server] running on http://localhost:${env.PORT}`);
  console.log(`[LeadFlow Server] Environment: ${env.NODE_ENV}`);
  console.log(`[LeadFlow Server] Health check at http://localhost:${env.PORT}/api/health`);
});

// Establish MongoDB connection and conditionally initialize background workers
connectDB()
  .then(async () => {
    const redisConfig = getRedisConfig();
    if (redisConfig.isConfigured) {
      console.log('[LeadFlow Workers] Redis is configured. Initializing background workers...');
      try {
        workflowWorker = createWorkflowWorker();
        setWorkflowWorkerInstance(workflowWorker);

        try {
          campaignWorker = createCampaignWorker();
          setCampaignWorkerInstance(campaignWorker);
          console.log('[LeadFlow Workers] Workflow and Campaign workers initialized successfully.');
        } catch (campaignError: any) {
          console.error(
            '[LeadFlow Workers] Campaign worker failed to initialize. Rolling back workflow worker:',
            campaignError.message
          );
          try {
            await workflowWorker.close();
            console.log('[LeadFlow Workers] Workflow worker rollback cleanup succeeded.');
          } catch (cleanupError: any) {
            console.error(
              '[LeadFlow Workers] Error during workflow worker rollback cleanup:',
              cleanupError.message
            );
          } finally {
            workflowWorker = null;
            setWorkflowWorkerInstance(null);
            setCampaignWorkerInstance(null);
          }
          throw campaignError;
        }
      } catch (workerError: any) {
        console.error('[LeadFlow Workers] Failed to initialize background workers:', workerError.message);
      }
    } else {
      console.log('[LeadFlow Workers] Redis not configured. Background workers not started.');
    }
  })
  .catch((error) => {
    console.error('[LeadFlow Server] Initial database connection attempt failed:', error.message);
  });

/**
 * Coordinates unified graceful teardown of all application resources:
 * 1. Stops accepting incoming HTTP traffic.
 * 2. Closes BullMQ workers (waits for active jobs to complete).
 * 3. Closes BullMQ queue instances and Redis connections.
 * 4. Closes MongoDB database connection.
 */
const coordinatedShutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`\n[LeadFlow Server] Received ${signal}. Starting coordinated shutdown...`);

  // Safeguard timeout to force exit if external resources stall (15 seconds)
  const forceExitTimer = setTimeout(() => {
    console.error('[LeadFlow Server] Shutdown timed out after 15s. Forcing exit.');
    process.exit(1);
  }, 15000);
  forceExitTimer.unref();

  let hasTeardownFailure = false;

  // 1. Stop accepting new HTTP requests
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    console.log('[LeadFlow Server] HTTP server closed.');
  } catch (serverErr: any) {
    hasTeardownFailure = true;
    console.warn('[LeadFlow Server] Warning while closing HTTP server:', serverErr.message);
  }

  // 2. Close BullMQ workers (waits for active jobs to finish, ceases polling)
  const workerClosures: Promise<any>[] = [];
  if (workflowWorker) {
    workerClosures.push(
      workflowWorker.close().then(() => {
        setWorkflowWorkerInstance(null);
        console.log('[LeadFlow Workers] Workflow worker closed.');
      })
    );
  }
  if (campaignWorker) {
    workerClosures.push(
      campaignWorker.close().then(() => {
        setCampaignWorkerInstance(null);
        console.log('[LeadFlow Workers] Campaign worker closed.');
      })
    );
  }

  if (workerClosures.length > 0) {
    const workerResults = await Promise.allSettled(workerClosures);
    for (const result of workerResults) {
      if (result.status === 'rejected') {
        hasTeardownFailure = true;
        console.error(
          '[LeadFlow Workers] Error closing worker:',
          result.reason?.message || result.reason
        );
      }
    }
  }

  // 3. Close BullMQ queue instances and Redis clients owned by the API
  const queueClosures = [
    closeWorkflowQueue().then(() => console.log('[LeadFlow Queues] Workflow queue closed.')),
    closeCampaignQueue().then(() => console.log('[LeadFlow Queues] Campaign queue closed.'))
  ];
  const queueResults = await Promise.allSettled(queueClosures);
  for (const result of queueResults) {
    if (result.status === 'rejected') {
      hasTeardownFailure = true;
      console.error(
        '[LeadFlow Queues] Error closing queue resources:',
        result.reason?.message || result.reason
      );
    }
  }

  // 4. Close MongoDB connection
  try {
    await disconnectDB();
  } catch (dbErr: any) {
    hasTeardownFailure = true;
    console.error('[LeadFlow Server] Error disconnecting database:', dbErr.message);
  }

  // 5. Report teardown status and exit
  if (hasTeardownFailure) {
    console.error('[LeadFlow Server] Coordinated shutdown completed with cleanup errors.');
    process.exit(1);
  } else {
    console.log('[LeadFlow Server] Coordinated shutdown complete.');
    process.exit(0);
  }
};

process.on('SIGTERM', () => coordinatedShutdown('SIGTERM'));
process.on('SIGINT', () => coordinatedShutdown('SIGINT'));

export default server;
