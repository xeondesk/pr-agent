import Queue from 'bull';

export interface JobData {
  type: 'analyze-pr' | 'run-agents' | 'webhook-process';
  prUrl?: string;
  diff?: string;
  capabilities?: string[];
  mode?: string;
  webhookEventId?: string;
  [key: string]: any;
}

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'pending';
  data?: Record<string, any>;
  error?: string;
  progress?: number;
  timestamp: Date;
}

let analysisQueue: Queue.Queue<JobData> | null = null;
let webhookQueue: Queue.Queue<JobData> | null = null;

// Get or create analysis queue
export function getAnalysisQueue(): Queue.Queue<JobData> {
  if (!analysisQueue) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    analysisQueue = new Queue('pr-analysis', redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Keep for 1 hour
        },
      },
    });

    // Set up event listeners
    analysisQueue.on('completed', (job) => {
      console.log(`[Queue] Analysis job ${job.id} completed`);
    });

    analysisQueue.on('failed', (job, err) => {
      console.error(`[Queue] Analysis job ${job.id} failed:`, err.message);
    });

    analysisQueue.on('progress', (job, progress) => {
      console.log(`[Queue] Analysis job ${job.id} progress: ${progress}%`);
    });
  }

  return analysisQueue;
}

// Get or create webhook queue
export function getWebhookQueue(): Queue.Queue<JobData> {
  if (!webhookQueue) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    webhookQueue = new Queue('webhooks', redisUrl, {
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: {
          age: 86400, // Keep for 24 hours
        },
      },
    });

    webhookQueue.on('completed', (job) => {
      console.log(`[Queue] Webhook job ${job.id} completed`);
    });

    webhookQueue.on('failed', (job, err) => {
      console.error(`[Queue] Webhook job ${job.id} failed:`, err.message);
    });
  }

  return webhookQueue;
}

// Queue an analysis job
export async function queueAnalysisJob(
  data: Omit<JobData, 'type'>
): Promise<string> {
  try {
    const queue = getAnalysisQueue();
    const job = await queue.add(
      {
        ...data,
        type: 'analyze-pr',
      },
      {
        jobId: `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
    );

    return job.id.toString();
  } catch (error) {
    console.error('Failed to queue analysis job:', error);
    throw error;
  }
}

// Queue a webhook processing job
export async function queueWebhookJob(
  data: Omit<JobData, 'type'>
): Promise<string> {
  try {
    const queue = getWebhookQueue();
    const job = await queue.add(
      {
        ...data,
        type: 'webhook-process',
      },
      {
        jobId: `webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        priority: 10, // Webhooks are high priority
      }
    );

    return job.id.toString();
  } catch (error) {
    console.error('Failed to queue webhook job:', error);
    throw error;
  }
}

// Get job status
export async function getJobStatus(jobId: string): Promise<JobResult | null> {
  try {
    // Try analysis queue first
    const analysisQueue = getAnalysisQueue();
    let job = await analysisQueue.getJob(jobId);

    if (!job) {
      // Try webhook queue
      const webhookQueue = getWebhookQueue();
      job = await webhookQueue.getJob(jobId);
    }

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      jobId: job.id.toString(),
      status: state as 'completed' | 'failed' | 'pending',
      data: job.data,
      progress: typeof progress === 'number' ? progress : 0,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Failed to get job status:', error);
    return null;
  }
}

// Process analysis jobs
export async function processAnalysisJobs(
  handler: (job: Queue.Job<JobData>) => Promise<void>
) {
  const queue = getAnalysisQueue();

  // Process up to 5 jobs concurrently
  queue.process(5, handler);

  console.log('[Queue] Analysis job processor started');
}

// Process webhook jobs
export async function processWebhookJobs(
  handler: (job: Queue.Job<JobData>) => Promise<void>
) {
  const queue = getWebhookQueue();

  // Process webhooks with higher concurrency (up to 10)
  queue.process(10, handler);

  console.log('[Queue] Webhook job processor started');
}

// Get queue statistics
export async function getQueueStats(queueType: 'analysis' | 'webhook') {
  try {
    const queue =
      queueType === 'analysis' ? getAnalysisQueue() : getWebhookQueue();

    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();

    return {
      active,
      completed,
      failed,
      pending: waiting,
    };
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    return null;
  }
}

// Cleanup old jobs
export async function cleanupOldJobs(hoursOld: number = 24) {
  try {
    const analysisQueue = getAnalysisQueue();
    const webhookQueue = getWebhookQueue();

    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;

    // Cleanup both queues
    await analysisQueue.clean(cutoff, 'completed');
    await webhookQueue.clean(cutoff, 'completed');

    console.log(`[Queue] Cleaned up jobs older than ${hoursOld} hours`);
  } catch (error) {
    console.error('Failed to cleanup jobs:', error);
  }
}
