import type { Worker } from 'bullmq';
import { getRedisConfig } from '../config/redis.config';

let workflowWorkerInstance: Worker | null = null;
let campaignWorkerInstance: Worker | null = null;

export interface SingleWorkerStatus {
  initialized: boolean;
  status: 'running' | 'paused' | 'stopped' | 'not_configured';
}

export interface WorkersHealthReport {
  workflow: SingleWorkerStatus;
  campaign: SingleWorkerStatus;
}

export const setWorkflowWorkerInstance = (worker: Worker | null): void => {
  workflowWorkerInstance = worker;
};

export const getWorkflowWorkerInstance = (): Worker | null => {
  return workflowWorkerInstance;
};

export const setCampaignWorkerInstance = (worker: Worker | null): void => {
  campaignWorkerInstance = worker;
};

export const getCampaignWorkerInstance = (): Worker | null => {
  return campaignWorkerInstance;
};

/**
 * Returns worker loop initialization and polling status.
 * Note: Reflects whether the worker process has been initialized and its polling loop
 * is active. This does NOT verify end-to-end job processing or queue throughput.
 */
export const getWorkersHealthReport = (): WorkersHealthReport => {
  const redisConfig = getRedisConfig();

  const evaluateWorker = (worker: Worker | null): SingleWorkerStatus => {
    if (!redisConfig.isConfigured) {
      return { initialized: false, status: 'not_configured' };
    }
    if (!worker) {
      return { initialized: false, status: 'stopped' };
    }
    try {
      if (typeof worker.isRunning === 'function' && worker.isRunning()) {
        return { initialized: true, status: 'running' };
      }
      if (typeof worker.isPaused === 'function' && worker.isPaused()) {
        return { initialized: true, status: 'paused' };
      }
      return { initialized: true, status: 'stopped' };
    } catch {
      return { initialized: true, status: 'stopped' };
    }
  };

  return {
    workflow: evaluateWorker(workflowWorkerInstance),
    campaign: evaluateWorker(campaignWorkerInstance)
  };
};
