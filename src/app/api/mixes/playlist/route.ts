import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

import prisma from '@/lib/prisma';

const execAsync = promisify(exec);

const querySchema = z.object({
  playlistId: z.string().min(1, 'playlistId manquant'),
});

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return 'Erreur inconnue';
}

async function resolveFfmpegCommand(): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const primary = isWindows ? 'ffmpeg.exe' : 'ffmpeg';

  try {
    await execAsync(isWindows ? 'where ffmpeg.exe' : 'which ffmpeg');
    return primary;
  } catch {
    if (isWindows) {
      try {
        await execAsync('where ffmpeg');
        return 'ffmpeg';
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Many players send a follow-up GET with Range; we cannot satisfy byte ranges on a live
    // transcode without buffering the full output, so we ignore Range and always stream from 0 (HTTP 200).

    const validated = querySchema.parse({
      playlistId: request.nextUrl.searchParams.get('playlistId'),
    });

    const playlist = await prisma.playlist.findUnique({
      where: { id: validated.playlistId },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: {
            track: {
              select: {
                id: true,
                s3Url: true,
              },
            },
          },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ status: 404, error: 'Playlist introuvable' }, { status: 404 });
    }

    if (playlist.tracks.length === 0) {
      return NextResponse.json({ status: 400, error: 'La playlist ne contient aucune musique' }, { status: 400 });
    }

    const sources: string[] = [];
    for (const playlistTrack of playlist.tracks) {
      const s3Url = playlistTrack.track.s3Url?.trim();
      if (!s3Url) {
        return NextResponse.json(
          { status: 422, error: `URL S3 manquante pour la piste ${playlistTrack.track.id}` },
          { status: 422 },
        );
      }
      try {
        new URL(s3Url);
      } catch {
        return NextResponse.json(
          { status: 422, error: `URL S3 invalide pour la piste ${playlistTrack.track.id}` },
          { status: 422 },
        );
      }
      sources.push(s3Url);
    }

    const ffmpegCommand = await resolveFfmpegCommand();
    if (!ffmpegCommand) {
      return NextResponse.json(
        {
          status: 500,
          error: 'ffmpeg introuvable sur le serveur. Installe ffmpeg pour activer le mix sans stockage.',
        },
        { status: 500 },
      );
    }

    const inputArgs = sources.flatMap((url) => ['-i', url]);
    const concatInputs = sources.map((_, index) => `[${index}:a]`).join('');
    const filterComplex = `${concatInputs}concat=n=${sources.length}:v=0:a=1[aout]`;

    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[aout]',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-f',
      'mp3',
      '-id3v2_version',
      '3',
      '-write_xing',
      '0',
      'pipe:1',
    ];

    const ffmpeg = spawn(ffmpegCommand, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    ffmpeg.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let settled = false;

        const settleClose = () => {
          if (settled) return;
          settled = true;
          try {
            controller.close();
          } catch {
            // Consumer may have already aborted the stream.
          }
        };

        const settleError = (err: unknown) => {
          if (settled) return;
          settled = true;
          const error = err instanceof Error ? err : new Error(formatErrorMessage(err));
          try {
            controller.error(error);
          } catch {
            // Same as settleClose.
          }
        };

        ffmpeg.stdout?.on('data', (chunk: Buffer) => {
          if (settled) return;
          try {
            controller.enqueue(new Uint8Array(chunk));
          } catch {
            settled = true;
          }
        });

        ffmpeg.stdout?.on('error', (err) => {
          settleError(err);
        });

        ffmpeg.on('error', (err) => {
          settleError(err);
        });

        ffmpeg.on('close', (code) => {
          if (code === 0 || code === null) {
            settleClose();
            return;
          }
          const detail = stderr.trim();
          settleError(new Error(detail || `ffmpeg exited with code ${code}`));
        });
      },
      cancel() {
        if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
      },
    });

    request.signal.addEventListener('abort', () => {
      if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="playlist-${playlist.id}.mp3"`,
      },
    });
  } catch (error: any) {
    const message = formatErrorMessage(error);
    return NextResponse.json({ status: 400, error: message }, { status: 400 });
  }
}
