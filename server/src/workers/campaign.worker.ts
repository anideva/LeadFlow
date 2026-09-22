import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { getRedisConnectionOptions } from '../config/redis.config';
import { connectDB } from '../config/db';
import { CAMPAIGN_QUEUE_NAME, CampaignJobData } from '../queues/campaign.queue';
import { CampaignService } from '../services/campaign.service';

const DEFAULT_CONCURRENCY = process.env.CAMPAIGN_WORKER_CONCURRENCY
  ? parseInt(process.env.CAMPAIGN_WORKER_CONCURRENCY, 10)
  : 5;

/**
 * Job processor function invoked by the BullMQ worker for each queued campaign lead job.
 */
export const processCampaignJob = async (job: Job<CampaignJobData>): Promise<any> => {
  const { campaignId, campaignLeadId, workspaceId } = job.data;

  console.log(
    `[Campaign Worker] Processing job ${job.id} (Campaign: ${campaignId}, CampaignLead: ${campaignLeadId}, Workspace: ${workspaceId})`
  );

  // Validate job payload integrity
  if (!campaignId || !campaignLeadId || !workspaceId) {
    throw new Error('Invalid campaign job payload: missing required identification fields.');
  }

  // Invoke business logic engine (workspace revalidation, idempotency, template rendering, email delivery, status update)
  const result = await CampaignService.processCampaignLead(job.data);

  console.log(
    `[Campaign Worker] Completed job ${job.id} with status: ${result.status}${result.skipped ? ' (skipped)' : ''}`
  );

  return result;
};

/**
 * Creates and initializes the BullMQ Campaign Worker instance.
 */
export const createCampaignWorker = (): Worker<CampaignJobData> => {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<CampaignJobData>(CAMPAIGN_QUEUE_NAME, processCampaignJob, {
    connection: connection as any,
    concurrency: isNaN(DEFAULT_CONCURRENCY) ? 5 : DEFAULT_CONCURRENCY
  });

  worker.on('completed', (job) => {
    console.log(`[Campaign Worker Event] Job ${job?.id} finished successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Campaign Worker Event] Job ${job?.id} failed on attempt ${job?.attemptsMade}:`, err.message);
  });

  worker.on('error', (err) => {
    console.warn('[Campaign Worker Error]:', err.message);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Campaign Worker] Received ${signal}. Starting graceful shutdown...`);
    try {
      await worker.close();
      console.log('[Campaign Worker] BullMQ worker closed successfully.');

      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('[Campaign Worker] Database connection closed.');
      }

      process.exit(0);
    } catch (shutdownErr: any) {
      console.error('[Campaign Worker] Error during worker shutdown:', shutdownErr.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return worker;
};

// If started directly via `tsx src/workers/campaign.worker.ts` or compiled `node dist/workers/campaign.worker.js`
if (require.main === module) {
  (async () => {
    console.log('====================================================');
    console.log('STARTING LEADFLOW CAMPAIGN BACKGROUND WORKER');
    console.log('====================================================\n');

    try {
      await connectDB();
      const worker = createCampaignWorker();
      console.log(`[Campaign Worker] Listening for jobs on queue "${CAMPAIGN_QUEUE_NAME}" (Concurrency: ${DEFAULT_CONCURRENCY})`);
    } catch (err: any) {
      console.error('[Campaign Worker Fatal] Failed to start worker process:', err.message);
      process.exit(1);
    }
  })();
}
