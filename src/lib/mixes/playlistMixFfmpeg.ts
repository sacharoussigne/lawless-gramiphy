import { spawn } from 'child_process';

import prisma from '@/lib/prisma';

export type PlaylistMixLoadResult =
  | { ok: true; playlistId: string; sources: string[] }
  | { ok: false; status: number; body: { status: number; error: string } };

export async function loadPlaylistMixSources(playlistId: string): Promise<PlaylistMixLoadResult> {
  const id = playlistId?.trim();
  if (!id) {
    return { ok: false, status: 400, body: { status: 400, error: 'playlistId manquant' } };
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id },
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
    return { ok: false, status: 404, body: { status: 404, error: 'Playlist introuvable' } };
  }

  if (playlist.tracks.length === 0) {
    return { ok: false, status: 400, body: { status: 400, error: 'La playlist ne contient aucune musique' } };
  }

  const sources: string[] = [];
  for (const playlistTrack of playlist.tracks) {
    const s3Url = playlistTrack.track.s3Url?.trim();
    if (!s3Url) {
      return {
        ok: false,
        status: 422,
        body: { status: 422, error: `URL S3 manquante pour la piste ${playlistTrack.track.id}` },
      };
    }
    try {
      new URL(s3Url);
    } catch {
      return {
        ok: false,
        status: 422,
        body: { status: 422, error: `URL S3 invalide pour la piste ${playlistTrack.track.id}` },
      };
    }
    sources.push(s3Url);
  }

  return { ok: true, playlistId: playlist.id, sources };
}

export function buildFfmpegMixArgs(sources: string[]): string[] {
  const inputArgs = sources.flatMap((url) => ['-i', url]);
  const concatInputs = sources.map((_, index) => `[${index}:a]`).join('');
  const filterComplex = `${concatInputs}concat=n=${sources.length}:v=0:a=1[aout]`;

  return [
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
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return 'Erreur inconnue';
}

export function spawnFfmpegMix(ffmpegCommand: string, sources: string[]) {
  return spawn(ffmpegCommand, buildFfmpegMixArgs(sources), {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

export function createFfmpegMixReadableStream(
  ffmpeg: ReturnType<typeof spawn>,
  requestSignal: AbortSignal,
): ReadableStream<Uint8Array> {
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

  const onAbort = () => {
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };
  requestSignal.addEventListener('abort', onAbort, { once: true });

  return stream;
}

const DEFAULT_MAX_BUFFER_BYTES = 512 * 1024 * 1024;

export async function bufferFfmpegMixToUint8Array(
  ffmpegCommand: string,
  sources: string[],
  options?: { maxBytes?: number; signal?: AbortSignal },
): Promise<Uint8Array> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const signal = options?.signal;

  const ffmpeg = spawnFfmpegMix(ffmpegCommand, sources);
  const chunks: Buffer[] = [];
  let total = 0;

  let stderr = '';
  ffmpeg.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const onAbort = () => {
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
        finish(() =>
          reject(
            new Error(
              `Mix trop volumineux (limite ${maxBytes} octets). Réduis la playlist ou augmente MIX_MAX_BUFFER_BYTES.`,
            ),
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    ffmpeg.stdout?.on('error', (err) => finish(() => reject(err)));
    ffmpeg.on('error', (err) => finish(() => reject(err)));
    ffmpeg.on('close', (code) => {
      if (settled) return;
      if (code === 0 || code === null) {
        finish(() => resolve());
        return;
      }
      finish(() => reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`)));
    });
  });

  return new Uint8Array(Buffer.concat(chunks));
}
