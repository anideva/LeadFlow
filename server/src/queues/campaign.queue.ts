import { Queue, JobsOptions } from 'bullmq';
import { getRedisConnectionOptions, getRedisConfig } from '../config/redis.config';
import { AppError } from '../utils/error.util';
import IORedis from 'ioredis';

export const CAMPAIGN_QUEUE_NAME = 'leadflow-campaigns';

export interface CampaignJobData {
  campaignId: string;
  campaignLeadId: string;
  workspaceId: string;
}

/**
 * Default job options for BullMQ campaign email dispatch:
 * - attempts: 3 (bounded retries to prevent runaway loops)
 * - backoff: exponential starting at 2000ms (2s, 4s, 8s)
 * - removeOnComplete: retain last 500 completed jobs or 24h
 * - removeOnFail: retain last 1000 failed jobs or 7 days for audit/diagnostics
 */
export const DEFAULT_CAMPAIGN_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    count: 500,
    age: 24 * 3600
  },
  removeOnFail: {
    count: 1000,
    age: 7 * 24 * 3600
  }
};

let campaignQueueInstance: Queue | null = null;
let sharedRedisClient: IORedis | null = null;

/**
 * Returns a dedicated ioredis client instance for queue availability checks.
 */
export const getRedisClient = (): IORedis => {
  if (!sharedRedisClient) {
    const options = getRedisConnectionOptions();
    sharedRedisClient = new IORedis({
      ...options,
      enableOfflineQueue: false
    });

    sharedRedisClient.on('error', (err) => {
      if (process.env.DEBUG || getRedisConfig().isConfigured) {
        console.warn(`[Redis Connection Warning - Campaigns] Could not connect to Redis at ${options.host}:${options.port}:`, err.message);
      }
    });
  }
  return sharedRedisClient;
};

/**
 * Retrieves the singleton BullMQ campaign queue instance.
 */
export const getCampaignQueue = (): Queue => {
  if (!campaignQueueInstance) {
    const connection = getRedisConnectionOptions();
    campaignQueueInstance = new Queue(CAMPAIGN_QUEUE_NAME, {
      connection: connection as any,
      defaultJobOptions: DEFAULT_CAMPAIGN_JOB_OPTIONS
    });

    campaignQueueInstance.on('error', (err) => {
      if (process.env.DEBUG || getRedisConfig().isConfigured) {
        console.warn('[BullMQ Campaign Queue Warning]:', err.message);
      }
    });
  }
  return campaignQueueInstance;
};

/**
 * Allows test suites or custom runners to inject a mock or alternate queue instance.
 */
export const setCampaignQueueInstance = (queue: any): void => {
  campaignQueueInstance = queue;
};

/**
 * Checks whether Redis and the campaign queue are actively responding.
 */
export const isCampaignQueueAvailable = async (): Promise<boolean> => {
  const config = getRedisConfig();
  if (!config.isConfigured) {
    return false;
  }
  try {
    const client = getRedisClient();
    if (client.status !== 'ready') {
      if (client.status === 'connecting' || client.status === 'connect') {
        await new Promise<void>((resolve) => {
          const onReady = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); resolve(); };
          const timer = setTimeout(() => { cleanup(); resolve(); }, 1500);
          const cleanup = () => {
            clearTimeout(timer);
            client.removeListener('ready', onReady);
            client.removeListener('error', onError);
          };
          client.once('ready', onReady);
          client.once('error', onError);
        });
      }
      if ((client.status as string) !== 'ready') {
        return false;
      }
    }
    const pongPromise = client.ping();
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), 1000)
    );
    const pong = await Promise.race([pongPromise, timeoutPromise]);
    return pong === 'PONG';
  } catch {
    return false;
  }
};

/**
 * Safely enqueues a batch of campaign jobs for background delivery.
 * Uses deterministic job IDs (camp-{campaignId}-lead-{campaignLeadId}) for BullMQ-level deduplication.
 * Fails cleanly with HTTP 503 if Redis is unavailable.
 */
export const enqueueCampaignJobs = async (
  jobsData: CampaignJobData[],
  customOptions?: JobsOptions
): Promise<string[]> => {
  if (jobsData.length === 0) {
    return [];
  }

  const isMock = Boolean(campaignQueueInstance && (campaignQueueInstance as any)._isMock);
  if (!isMock) {
    const available = await isCampaignQueueAvailable();
    if (!available) {
      throw new AppError(
        503,
        'Background processing queue is currently unavailable. Redis connection could not be established.'
      );
    }
  }

  try {
    const queue = getCampaignQueue();

    // Map each item to a BullMQ bulk job descriptor with deterministic jobId
    const bulkPayload = jobsData.map((data) => ({
      name: 'send-campaign-lead',
      data,
      opts: {
        jobId: `camp-${data.campaignId}-lead-${data.campaignLeadId}`,
        ...customOptions
      }
    }));

    const addBulkPromise = queue.addBulk(bulkPayload);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Queue addBulk operation timed out')), 5000)
    );

    const jobs = await Promise.race([addBulkPromise, timeoutPromise]);
    return jobs.map((j) => j.id || '');
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    console.error('[Campaign Queue] Failed to enqueue jobs:', err.message);
    throw new AppError(
      503,
      'Background processing queue is currently unavailable. Redis connection could not be established.'
    );
  }
};

/**
 * Gracefully closes the BullMQ campaign queue and its underlying Redis connections.
 */
export const closeCampaignQueue = async (): Promise<void> => {
  if (campaignQueueInstance) {
    await campaignQueueInstance.close();
    campaignQueueInstance = null;
  }
  if (sharedRedisClient) {
    sharedRedisClient.disconnect();
    sharedRedisClient = null;
  }
};
