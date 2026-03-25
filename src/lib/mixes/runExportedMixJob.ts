import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { spawn } from 'child_process';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import prisma from '@/lib/prisma';
import { buildFfmpegLocalConcatArgs } from '@/lib/mixes/ffmpegConcatArgs';
import { resolveFfmpegCommand } from '@/lib/mixes/ffmpegCommand';
import { buildMixS3Key, buildMixS3Url, getMixBucketRegion } from '@/lib/mixes/mixConfig';
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
  orderedTracks: ResolvedMixTrack[];
  totalSeconds: number;
}) {
  const { jobId, userId, orderedTracks, totalSeconds } = options;
  const { bucket, region } = getMixBucketRegion();

  // Mix signature stable for a user + ordered trackIds.
  const mixId = createHash('sha256')
    .update(`${userId}:${orderedTracks.map((t) => t.id).join('|')}`)
    .digest('hex');
  const s3Key = buildMixS3Key(mixId);
  const s3Url = buildMixS3Url(bucket, region, s3Key);

  let mixObjectExistsInS3 = false;
  let existingMixRecord: { expiresAt: Date | null } | null = null;
  try {
    const existingMix = await prisma.mix.findUnique({
      where: { id: mixId },
      select: { s3Url: true, expiresAt: true },
    });
    existingMixRecord = existingMix ? { expiresAt: existingMix.expiresAt } : null;

    // If a record exists, check whether the object is still available in S3.
    if (existingMix) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
        mixObjectExistsInS3 = true;
      } catch {
        // ignore (S3 might have already expired/deleted)
      }
    }

    // Reuse path: if the object exists in S3, we're done (no renew logic).
    if (existingMix && mixObjectExistsInS3) {
      if (!getMixJob(jobId) || getMixJob(jobId)?.status === 'canceled') return;

      setMixJob(jobId, {
        status: 'done',
        message: 'Terminé',
        s3Url: existingMix.s3Url,
        mixId,
        child: null,
      });

      setTimeout(() => removeMixJob(jobId), 120_000);
      return;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur mix';
    setMixJob(jobId, { status: 'error', message: msg, error: msg, child: null });
    setTimeout(() => removeMixJob(jobId), 120_000);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramiphy-mix-'));
  const localPaths: string[] = [];
  // Avoid deleting a stable S3 key if it existed before our overwrite.
  let pendingS3KeyToDelete: string | null = mixObjectExistsInS3 ? null : s3Key;

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

    await prisma.$transaction(async (tx) => {
      const nextExpiresAt =
        existingMixRecord?.expiresAt === null
          ? null
          : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await tx.mix.upsert({
        where: { id: mixId },
        update: {
          s3Key,
          s3Url,
          totalDurationSeconds: totalSeconds,
          fileSizeMb,
          expiresAt: nextExpiresAt,
        },
        create: {
          id: mixId,
          s3Key,
          s3Url,
          totalDurationSeconds: totalSeconds,
          fileSizeMb,
          userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await tx.mixTrack.deleteMany({ where: { mixId } });
      await tx.mixTrack.createMany({
        data: orderedTracks.map((t, idx) => ({
          id: `${mixId}_${idx}`,
          mixId,
          trackId: t.id,
          position: idx,
        })),
        skipDuplicates: true,
      });
    });

    pendingS3KeyToDelete = null;

    if (!assertNotCanceled()) {
      // If the stable key existed before, don't delete on cancel:
      // we want to avoid breaking any existing links/objects.
      if (!mixObjectExistsInS3) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
        } catch {
          // ignore
        }
        await prisma.mix.delete({ where: { id: mixId } }).catch(() => {});
      }
      return;
    }

    setMixJob(jobId, {
      status: 'done',
      message: 'Terminé',
      s3Url,
      mixId,
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
