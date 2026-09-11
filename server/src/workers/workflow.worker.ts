import { Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { getRedisConnectionOptions } from '../config/redis.config';
import { connectDB } from '../config/db';
import { WORKFLOW_QUEUE_NAME, WorkflowJobData } from '../queues/workflow.queue';
import { WorkflowExecutionService } from '../services/workflow-execution.service';

const DEFAULT_CONCURRENCY = process.env.WORKER_CONCURRENCY
  ? parseInt(process.env.WORKER_CONCURRENCY, 10)
  : 5;

/**
 * Job processor function invoked by the BullMQ worker for each queued workflow job.
 */
export const processWorkflowJob = async (job: Job<WorkflowJobData>): Promise<any> => {
  const { workflowId, leadId, workspaceId, triggerType, executionId } = job.data;

  console.log(
    `[Workflow Worker] Processing job ${job.id} (Execution: ${executionId}, Workflow: ${workflowId}, Lead: ${leadId}, Trigger: ${triggerType})`
  );

  // Validate job payload integrity
  if (!workflowId || !leadId || !workspaceId || !executionId) {
    throw new Error('Invalid workflow job payload: missing required identification fields.');
  }

  // Invoke business logic engine (DAG traversal, condition evaluation, action execution)
  const result = await WorkflowExecutionService.executeWorkflowJob(job.data);

  console.log(
    `[Workflow Worker] Completed job ${job.id} (Execution: ${executionId}) in status: ${result.status} (${result.stepsCount} steps)`
  );

  return result;
};

/**
 * Creates and initializes the BullMQ Workflow Worker instance.
 */
export const createWorkflowWorker = (): Worker<WorkflowJobData> => {
  const connection = getRedisConnectionOptions();

  const worker = new Worker<WorkflowJobData>(WORKFLOW_QUEUE_NAME, processWorkflowJob, {
    connection: connection as any,
    concurrency: isNaN(DEFAULT_CONCURRENCY) ? 5 : DEFAULT_CONCURRENCY
  });

  worker.on('completed', (job) => {
    console.log(`[Workflow Worker Event] Job ${job?.id} finished successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Workflow Worker Event] Job ${job?.id} failed on attempt ${job?.attemptsMade}:`, err.message);
  });

  worker.on('error', (err) => {
    console.warn('[Workflow Worker Error]:', err.message);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Workflow Worker] Received ${signal}. Starting graceful shutdown...`);
    try {
      await worker.close();
      console.log('[Workflow Worker] BullMQ worker closed successfully.');

      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('[Workflow Worker] Database connection closed.');
      }

      process.exit(0);
    } catch (shutdownErr: any) {
      console.error('[Workflow Worker] Error during worker shutdown:', shutdownErr.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return worker;
};

// If started directly via `tsx src/workers/workflow.worker.ts` or compiled `node dist/workers/workflow.worker.js`
if (require.main === module) {
  (async () => {
    console.log('====================================================');
    console.log('STARTING LEADFLOW WORKFLOW BACKGROUND WORKER');
    console.log('====================================================\n');

    try {
      await connectDB();
      const worker = createWorkflowWorker();
      console.log(`[Workflow Worker] Listening for jobs on queue "${WORKFLOW_QUEUE_NAME}" (Concurrency: ${DEFAULT_CONCURRENCY})`);
    } catch (err: any) {
      console.error('[Workflow Worker Fatal] Failed to start worker process:', err.message);
      process.exit(1);
    }
  })();
}
