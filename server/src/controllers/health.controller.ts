import { Request, Response } from 'express';
import mongoose from 'mongoose';

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

export const getHealthStatus = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'LeadFlow Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus()
  });
};
