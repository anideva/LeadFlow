import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { isQueueAvailable } from '../queues/workflow.queue';
import { isCampaignQueueAvailable } from '../queues/campaign.queue';
import { getRedisConfig } from '../config/redis.config';
import { getWorkersHealthReport } from '../workers/worker.registry';

const getDatabaseStatus = (): string => {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
};

export const getHealthStatus = async (_req: Request, res: Response): Promise<void> => {
  const redisConfig = getRedisConfig();
  let redisStatus = 'disconnected';
  let queueStatus = 'unavailable';

  try {
    const [workflowQueueOnline, campaignQueueOnline] = await Promise.all([
      isQueueAvailable(),
      isCampaignQueueAvailable()
    ]);

    if (workflowQueueOnline && campaignQueueOnline) {
      redisStatus = 'connected';
      queueStatus = 'available';
    } else if (workflowQueueOnline || campaignQueueOnline) {
      redisStatus = 'connected';
      queueStatus = 'degraded';
    } else if (!redisConfig.isConfigured) {
      redisStatus = 'not_configured';
      queueStatus = 'unavailable';
    }
  } catch {
    redisStatus = 'disconnected';
    queueStatus = 'unavailable';
  }

  // Worker polling loop status (loop state only, does not imply verified job execution)
  const workersHealth = getWorkersHealthReport();

  res.status(200).json({
    status: 'ok',
    service: 'LeadFlow Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
    redis: redisStatus,
    queue: queueStatus,
    workers: workersHealth
  });
};
