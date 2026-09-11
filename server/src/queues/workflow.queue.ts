import { Queue, JobsOptions } from 'bullmq';
import { getRedisConnectionOptions, getRedisConfig } from '../config/redis.config';
import { AppError } from '../utils/error.util';
import IORedis from 'ioredis';

export const WORKFLOW_QUEUE_NAME = 'leadflow-workflows';

export interface WorkflowJobData {
  workflowId: string;
  leadId: string;
  workspaceId: string;
  triggerType: 'lead_created' | 'lead_updated' | 'manual';
  executionId: string;
}

/**
 * Sensible default job options for BullMQ workflow execution:
 * - attempts: 3 (bounded retries to prevent infinite loops)
 * - backoff: exponential starting at 2000ms (2s, 4s, 8s)
 * - removeOnComplete: retain last 500 completed jobs or 24h
 * - removeOnFail: retain last 1000 failed jobs or 7 days for diagnostics
 */
export const DEFAULT_WORKFLOW_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    count: 500,
    age: 24 * 3600 // 24 hours
  },
  removeOnFail: {
    count: 1000,
    age: 7 * 24 * 3600 // 7 days
  }
};

let workflowQueueInstance: Queue | null = null;
let sharedRedisClient: IORedis | null = null;

/**
 * Returns a dedicated ioredis client instance for queue management.
 */
export const getRedisClient = (): IORedis => {
  if (!sharedRedisClient) {
    const options = getRedisConnectionOptions();
    sharedRedisClient = new IORedis({
      ...options,
      enableOfflineQueue: false
    });

    sharedRedisClient.on('error', (err) => {
      // Avoid unhandled rejection crashing the app in development when Redis is down
      // Operational logging only when configured; credentials are never exposed
      if (process.env.DEBUG || getRedisConfig().isConfigured) {
        console.warn(`[Redis Connection Warning] Could not connect to Redis at ${options.host}:${options.port}:`, err.message);
      }
    });
  }
  return sharedRedisClient;
};

/**
 * Retrieves the singleton BullMQ workflow queue instance.
 */
export const getWorkflowQueue = (): Queue => {
  if (!workflowQueueInstance) {
    const connection = getRedisConnectionOptions();
    workflowQueueInstance = new Queue(WORKFLOW_QUEUE_NAME, {
      connection: connection as any,
      defaultJobOptions: DEFAULT_WORKFLOW_JOB_OPTIONS
    });

    workflowQueueInstance.on('error', (err) => {
      if (process.env.DEBUG || getRedisConfig().isConfigured) {
        console.warn('[BullMQ Workflow Queue Warning]:', err.message);
      }
    });
  }
  return workflowQueueInstance;
};

/**
 * Allows test suites or custom runners to inject a mock or alternate queue instance.
 */
export const setWorkflowQueueInstance = (queue: any): void => {
  workflowQueueInstance = queue;
};

/**
 * Checks whether Redis and the workflow queue are actively responding.
 */
export const isQueueAvailable = async (): Promise<boolean> => {
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
 * Safely enqueues a workflow job for background processing.
 * Fails clearly with HTTP 503 if Redis is unavailable.
 */
export const enqueueWorkflowJob = async (
  data: WorkflowJobData,
  customOptions?: JobsOptions
): Promise<string> => {
  const available = await isQueueAvailable();
  if (!available) {
    throw new AppError(
      503,
      'Background processing queue is currently unavailable. Redis connection could not be established.'
    );
  }

  try {
    const queue = getWorkflowQueue();

    // Deterministic job ID using executionId to assist BullMQ-level deduplication
    const addPromise = queue.add(
      'execute-workflow',
      data,
      {
        jobId: `wf-exec-${data.executionId}`,
        ...customOptions
      }
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Queue add operation timed out')), 3000)
    );
    const job = await Promise.race([addPromise, timeoutPromise]);

    return job.id || data.executionId;
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }
    console.error('[Workflow Queue] Failed to enqueue job:', err.message);
    throw new AppError(
      503,
      'Background processing queue is currently unavailable. Redis connection could not be established.'
    );
  }
};

/**
 * Gracefully closes the BullMQ queue and its underlying Redis connections.
 */
export const closeWorkflowQueue = async (): Promise<void> => {
  if (workflowQueueInstance) {
    await workflowQueueInstance.close();
    workflowQueueInstance = null;
  }
  if (sharedRedisClient) {
    sharedRedisClient.disconnect();
    sharedRedisClient = null;
  }
};
