import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { isQueueAvailable } from '../queues/workflow.queue';
import { getRedisConfig } from '../config/redis.config';

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
    const queueOnline = await isQueueAvailable();
    if (queueOnline) {
      redisStatus = 'connected';
      queueStatus = 'available';
    } else if (!redisConfig.isConfigured) {
      redisStatus = 'not_configured';
      queueStatus = 'unavailable';
    }
  } catch {
    redisStatus = 'disconnected';
    queueStatus = 'unavailable';
  }

  res.status(200).json({
    status: 'ok',
    service: 'LeadFlow Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
    redis: redisStatus,
    queue: queueStatus
  });
};
