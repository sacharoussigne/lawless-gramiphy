import type { ChildProcess } from 'child_process';

export type MixJobStatus = 'queued' | 'concatenating' | 'uploading' | 'done' | 'error' | 'canceled';

export type MixJobPublic = {
  jobId: string;
  mixId?: string;
  status: MixJobStatus;
  message: string | null;
  createdAt: number;
  s3Url?: string;
  error?: string;
};

export type MixJobInternal = MixJobPublic & {
  userId: string;
  child: ChildProcess | null;
};

const globalForJobs = globalThis as unknown as {
  gramiphyMixJobs?: Map<string, MixJobInternal>;
};

function getStore() {
  if (!globalForJobs.gramiphyMixJobs) {
    globalForJobs.gramiphyMixJobs = new Map();
  }
  return globalForJobs.gramiphyMixJobs;
}

export function createMixJob(args: { jobId: string; userId: string }): MixJobInternal {
  const job: MixJobInternal = {
    jobId: args.jobId,
    userId: args.userId,
    status: 'queued',
    message: null,
    createdAt: Date.now(),
    child: null,
  };

  getStore().set(args.jobId, job);
  return job;
}

export function getMixJob(jobId: string): MixJobInternal | null {
  return getStore().get(jobId) ?? null;
}

export function setMixJob(jobId: string, patch: Partial<MixJobInternal>) {
  const job = getMixJob(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

export function toPublicMixJob(job: MixJobInternal): MixJobPublic {
  const base: MixJobPublic = {
    jobId: job.jobId,
    mixId: job.mixId,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
  };
  if (job.status === 'done' && job.s3Url) base.s3Url = job.s3Url;
  if (job.status === 'error' && job.error) base.error = job.error;
  return base;
}

export function removeMixJob(jobId: string) {
  getStore().delete(jobId);
}
