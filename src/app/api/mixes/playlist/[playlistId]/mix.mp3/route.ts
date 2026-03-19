import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

import { bufferFfmpegMixToUint8Array, loadPlaylistMixSources } from '@/lib/mixes/playlistMixFfmpeg';

const execAsync = promisify(exec);

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

function parseMaxBufferBytes(): number {
  const raw = process.env.MIX_MAX_BUFFER_BYTES?.trim();
  if (!raw) return 512 * 1024 * 1024;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 512 * 1024 * 1024;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const { playlistId } = await params;
    const loaded = await loadPlaylistMixSources(playlistId);
    if (!loaded.ok) {
      return NextResponse.json(loaded.body, { status: loaded.status });
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

    const body = await bufferFfmpegMixToUint8Array(ffmpegCommand, loaded.sources, {
      maxBytes: parseMaxBufferBytes(),
      signal: request.signal,
    });

    return new Response(body as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(body.byteLength),
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="playlist-${loaded.playlistId}.mp3"`,
      },
    });
  } catch (error: unknown) {
    const message = formatErrorMessage(error);
    return NextResponse.json({ status: 400, error: message }, { status: 400 });
  }
}
