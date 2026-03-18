import fs from 'fs';
import type { ChildProcess } from 'child_process';

export type DownloadJobStatus =
  | 'queued'
  | 'fetching_meta'
  | 'downloading'
  | 'uploading'
  | 'done'
  | 'error'
  | 'canceled';

export type DownloadJobPublic = {
  jobId: string;
  status: DownloadJobStatus;
  message: string | null;
  createdAt: number;
};

type DownloadJobInternal = DownloadJobPublic & {
  userId: string;
  youtubeId: string | null;
  mp3Path: string | null;
  tempPattern: string | null;
  child: ChildProcess | null;
  error: string | null;
};

const globalForJobs = globalThis as unknown as {
  gramiphyDownloadJobs?: Map<string, DownloadJobInternal>;
};

function getStore() {
  if (!globalForJobs.gramiphyDownloadJobs) {
    globalForJobs.gramiphyDownloadJobs = new Map();
  }
  return globalForJobs.gramiphyDownloadJobs;
}

export function createJob(args: { jobId: string; userId: string }): DownloadJobInternal {
  const job: DownloadJobInternal = {
    jobId: args.jobId,
    userId: args.userId,
    status: 'queued',
    message: null,
    createdAt: Date.now(),
    youtubeId: null,
    mp3Path: null,
    tempPattern: null,
    child: null,
    error: null,
  };

  getStore().set(args.jobId, job);
  return job;
}

export function getJob(jobId: string): DownloadJobInternal | null {
  return getStore().get(jobId) ?? null;
}

export function setJob(jobId: string, patch: Partial<DownloadJobInternal>) {
  const job = getJob(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

export function toPublic(job: DownloadJobInternal): DownloadJobPublic {
  return {
    jobId: job.jobId,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
  };
}

export function cleanupTempFiles(job: DownloadJobInternal) {
  if (job.mp3Path && fs.existsSync(job.mp3Path)) {
    try {
      fs.unlinkSync(job.mp3Path);
    } catch {
      // ignore
    }
  }
}

export function removeJob(jobId: string) {
  getStore().delete(jobId);
}

