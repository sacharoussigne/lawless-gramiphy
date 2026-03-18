import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { checkRolePermission } from '@/lib/auth/permissions';
import { actionErrorParser } from '@/lib/action';
import {
  cleanupTempFiles,
  createJob,
  getJob,
  removeJob,
  setJob,
  toPublic,
} from '@/lib/tracks/downloadJobs';

const execAsync = promisify(exec);

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function findYtDlpCommand(): Promise<string> {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'yt-dlp.exe' : 'yt-dlp';

  try {
    await execAsync(isWindows ? 'where yt-dlp.exe' : 'which yt-dlp');
    return command;
  } catch {
    if (isWindows) {
      try {
        await execAsync('where yt-dlp');
        return 'yt-dlp';
      } catch {
        return command;
      }
    }
    return command;
  }
}

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const startSchema = z.object({
  url: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session) {
      return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
    }

    const role = session.user.role ?? null;
    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = startSchema.parse(body);
    const url = validated.url.trim();

    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      return NextResponse.json({ status: 400, error: 'URL YouTube invalide' }, { status: 400 });
    }

    const existing = await prisma.track.findUnique({ where: { youtubeId } });
    if (existing) {
      return NextResponse.json(
        { status: 200, data: { cached: true, trackId: existing.id } },
        { status: 200 },
      );
    }

    const jobId = `dl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const job = createJob({ jobId, userId: session.user.id });

    const tmpDir = os.tmpdir();
    const outputTemplate = path.join(tmpDir, `${youtubeId}.%(ext)s`);
    const mp3Path = path.join(tmpDir, `${youtubeId}.mp3`);

    setJob(jobId, {
      youtubeId,
      mp3Path,
      tempPattern: path.join(tmpDir, `${youtubeId}.`),
      status: 'fetching_meta',
      message: 'Récupération des informations…',
    });

    const ytDlpCommand = await findYtDlpCommand();
    // Important: do NOT run through PowerShell on Windows because it interprets yt-dlp
    // output templates like %(ext)s. Spawn the binary directly to keep args intact.

    // Run asynchronously and let client poll status.
    void (async () => {
      try {
        // Metadata (spawn so we can cancel)
        const metaArgs = ['--dump-json', '--no-playlist', url];
        const metaProc = spawn(ytDlpCommand, metaArgs);
        setJob(jobId, { child: metaProc, status: 'fetching_meta', message: 'Récupération des informations…' });

        let metaRaw = '';
        let metaErr = '';
        metaProc.stdout?.on('data', (d) => (metaRaw += d.toString()));
        metaProc.stderr?.on('data', (d) => (metaErr += d.toString()));

        const metaExitCode: number = await new Promise((resolve) => metaProc.on('close', resolve as any));

        const latest = getJob(jobId);
        if (!latest || latest.status === 'canceled') return;

        if (metaExitCode !== 0) {
          throw new Error(metaErr || 'Erreur lors de la récupération des métadonnées');
        }

        const meta = JSON.parse(metaRaw);

        if (meta.title) {
          const existingByTitle = await prisma.track.findFirst({
            where: { title: { equals: meta.title, mode: 'insensitive' } },
          });
          if (existingByTitle) {
            throw new Error('Une musique avec ce nom existe déjà dans la bibliothèque');
          }
        }

        // Download / convert
        setJob(jobId, { status: 'downloading', message: 'Téléchargement en cours…' });
        const dlArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--no-playlist', '-o', outputTemplate, url];
        const dlProc = spawn(ytDlpCommand, dlArgs);
        setJob(jobId, { child: dlProc, status: 'downloading', message: 'Téléchargement en cours…' });

        let dlErr = '';
        dlProc.stderr?.on('data', (d) => (dlErr += d.toString()));

        const dlExitCode: number = await new Promise((resolve) => dlProc.on('close', resolve as any));

        const afterDl = getJob(jobId);
        if (!afterDl || afterDl.status === 'canceled') return;

        if (dlExitCode !== 0) {
          throw new Error(dlErr || 'Erreur lors du téléchargement');
        }

        if (!fs.existsSync(mp3Path)) {
          throw new Error('Fichier MP3 introuvable après conversion');
        }

        // Upload
        setJob(jobId, { status: 'uploading', message: 'Upload en cours…', child: null });

        const s3Key = `tracks/${youtubeId}.mp3`;
        const fileBuffer = fs.readFileSync(mp3Path);
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: 'audio/mpeg',
          }),
        );

        const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

        const created = await prisma.track.create({
          data: {
            title: meta.title,
            artist: meta.uploader ?? meta.channel ?? null,
            youtubeUrl: url,
            youtubeId,
            s3Key,
            s3Url,
            duration: meta.duration ?? null,
            thumbnail: meta.thumbnail ?? null,
            uploaderId: session.user.id,
            uploaderName: session.user.name ?? null,
          },
        });

        cleanupTempFiles({ ...job, mp3Path } as any);
        setJob(jobId, { status: 'done', message: 'Terminé', child: null });

        // Remove job after a short grace period
        setTimeout(() => removeJob(jobId), 60_000);

        // eslint-disable-next-line no-unused-vars
        void created;
      } catch (err: any) {
        const latest = getJob(jobId);
        if (!latest || latest.status === 'canceled') return;
        cleanupTempFiles(latest);
        setJob(jobId, { status: 'error', message: err?.message ?? 'Erreur', error: err?.message ?? 'Erreur', child: null });
        setTimeout(() => removeJob(jobId), 60_000);
      }
    })();

    return NextResponse.json({ status: 200, data: { jobId } }, { status: 200 });
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du démarrage du téléchargement');
    return NextResponse.json(
      { status: parsed.status, error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du démarrage du téléchargement' },
      { status: parsed.status },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
  }

  const role = session.user.role ?? null;
  const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
  if (!hasGramophoneAccess) {
    return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ status: 400, error: 'jobId manquant' }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ status: 404, error: 'Job introuvable' }, { status: 404 });
  }

  return NextResponse.json({ status: 200, data: toPublic(job) }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
  }

  const role = session.user.role ?? null;
  const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
  if (!hasGramophoneAccess) {
    return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ status: 400, error: 'jobId manquant' }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ status: 404, error: 'Job introuvable' }, { status: 404 });
  }

  if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
    return NextResponse.json({ status: 200, data: toPublic(job) }, { status: 200 });
  }

  try {
    job.child?.kill('SIGKILL');
  } catch {
    // ignore
  }

  cleanupTempFiles(job);
  setJob(jobId, { status: 'canceled', message: 'Annulé', child: null });
  setTimeout(() => removeJob(jobId), 30_000);

  return NextResponse.json({ status: 200, data: toPublic(getJob(jobId)!) }, { status: 200 });
}

