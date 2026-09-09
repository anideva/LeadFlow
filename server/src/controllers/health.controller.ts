import { Request, Response } from 'express';

export const getHealthStatus = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'LeadFlow Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
};
