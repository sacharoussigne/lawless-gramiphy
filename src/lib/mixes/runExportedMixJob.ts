import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { spawn } from 'child_process';
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import prisma from '@/lib/prisma';
import { buildFfmpegLocalConcatArgs } from '@/lib/mixes/ffmpegConcatArgs';
import { resolveFfmpegCommand } from '@/lib/mixes/ffmpegCommand';
import { getMixJob, removeMixJob, setMixJob } from '@/lib/mixes/mixJobs';
import type { ResolvedMixTrack } from '@/lib/mixes/resolveMixTracks';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function downloadTrackToFile(bucket: string, key: string, dest: string) {
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  if (!out.Body) throw new Error('Empty S3 response');
  await pipeline(out.Body as Readable, fs.createWriteStream(dest));
}

function runFfmpeg(ffmpegCommand: string, args: string[], jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegCommand, args, { windowsHide: true });
    setMixJob(jobId, { child: proc });
    let err = '';
    proc.stderr?.on('data', (c) => {
      err += c.toString();
    });
    proc.on('error', (e) => {
      setMixJob(jobId, { child: null });
      reject(e);
    });
    proc.on('close', (code) => {
      setMixJob(jobId, { child: null });
      if (code === 0 || code === null) resolve();
      else reject(new Error(err.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

export async function runExportedMixJob(options: {
  jobId: string;
  userId: string;
  playlistId: string | null;
  orderedTracks: ResolvedMixTrack[];
  totalSeconds: number;
}) {
  const { jobId, userId, playlistId, orderedTracks, totalSeconds } = options;
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION!;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramiphy-mix-'));
  const localPaths: string[] = [];
  let pendingS3KeyToDelete: string | null = null;

  const assertNotCanceled = () => {
    const j = getMixJob(jobId);
    if (!j || j.status === 'canceled') return false;
    return true;
  };

  try {
    if (!assertNotCanceled()) return;

    setMixJob(jobId, { status: 'concatenating', message: 'Téléchargement et concaténation…' });

    for (let i = 0; i < orderedTracks.length; i++) {
      if (!assertNotCanceled()) return;
      const t = orderedTracks[i]!;
      const localPath = path.join(tmpDir, `${i}.mp3`);
      await downloadTrackToFile(bucket, t.s3Key, localPath);
      localPaths.push(localPath);
    }

    if (!assertNotCanceled()) return;

    const outPath = path.join(tmpDir, 'out.mp3');
    const ffmpegCommand = await resolveFfmpegCommand();
    if (!ffmpegCommand) {
      throw new Error('ffmpeg introuvable sur le serveur');
    }

    await runFfmpeg(ffmpegCommand, buildFfmpegLocalConcatArgs(localPaths, outPath), jobId);

    if (!assertNotCanceled()) return;

    if (!fs.existsSync(outPath)) {
      throw new Error('Fichier mix introuvable après ffmpeg');
    }

    setMixJob(jobId, { status: 'uploading', message: 'Upload S3…' });

    const mixId = randomUUID();
    const s3Key = `mixes/${mixId}.mp3`;
    const fileBuffer = fs.readFileSync(outPath);
    const fileSizeMb = Math.round((fileBuffer.byteLength / (1024 * 1024)) * 10_000) / 10_000;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'audio/mpeg',
      }),
    );
    pendingS3KeyToDelete = s3Key;

    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

    await prisma.exportedMix.create({
      data: {
        id: mixId,
        s3Key,
        s3Url,
        totalDurationSeconds: totalSeconds,
        fileSizeMb,
        userId,
        playlistId,
        trackIds: orderedTracks.map((t) => t.id),
      },
    });
    pendingS3KeyToDelete = null;

    if (!assertNotCanceled()) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
      } catch {
        // ignore
      }
      await prisma.exportedMix.delete({ where: { id: mixId } }).catch(() => {});
      return;
    }

    setMixJob(jobId, {
      status: 'done',
      message: 'Terminé',
      s3Url,
      child: null,
    });

    setTimeout(() => removeMixJob(jobId), 120_000);
  } catch (e: unknown) {
    const j = getMixJob(jobId);
    if (j?.status === 'canceled') return;

    const msg = e instanceof Error ? e.message : 'Erreur mix';
    setMixJob(jobId, { status: 'error', message: msg, error: msg, child: null });
    setTimeout(() => removeMixJob(jobId), 120_000);

    if (pendingS3KeyToDelete) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: pendingS3KeyToDelete }));
      } catch {
        // ignore
      }
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
