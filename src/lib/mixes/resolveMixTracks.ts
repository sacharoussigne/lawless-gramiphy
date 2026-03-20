import { MAX_MIX_DURATION_SECONDS } from '@/constants/mix';
import prisma from '@/lib/prisma';

export { MAX_MIX_DURATION_SECONDS };

export type ResolvedMixTrack = {
  id: string;
  s3Key: string;
  s3Url: string;
  duration: number;
};

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function resolveMixTracksForBuild(options: {
  playlistId?: string | null;
  trackIds: string[];
}): Promise<
  | { ok: true; orderedTracks: ResolvedMixTrack[]; playlistId: string | null; totalSeconds: number }
  | { ok: false; status: number; error: string }
> {
  const playlistId = options.playlistId?.trim() || null;
  const rawIds = dedupePreserveOrder(options.trackIds.map((id) => id.trim()).filter(Boolean));

  if (playlistId) {
    const pl = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    });

    if (!pl) {
      return { ok: false, status: 404, error: 'Playlist introuvable' };
    }

    const inPlaylist = new Map(pl.tracks.map((pt) => [pt.trackId, pt.track]));

    let order: string[];
    if (rawIds.length === 0) {
      order = pl.tracks.map((pt) => pt.trackId);
    } else {
      for (const id of rawIds) {
        if (!inPlaylist.has(id)) {
          return { ok: false, status: 422, error: 'Une ou plusieurs musiques ne sont pas dans cette playlist' };
        }
      }
      order = rawIds;
    }

    if (order.length === 0) {
      return { ok: false, status: 400, error: 'Aucune musique à mixer' };
    }

    const orderedTracks: ResolvedMixTrack[] = [];
    for (const id of order) {
      const t = inPlaylist.get(id)!;
      if (t.duration == null) {
        return { ok: false, status: 422, error: `Durée inconnue pour « ${t.title} »` };
      }
      orderedTracks.push({
        id: t.id,
        s3Key: t.s3Key,
        s3Url: t.s3Url,
        duration: t.duration,
      });
    }

    const totalSeconds = orderedTracks.reduce((s, t) => s + t.duration, 0);
    if (totalSeconds > MAX_MIX_DURATION_SECONDS) {
      return { ok: false, status: 422, error: 'Le mix ne peut pas dépasser 35 minutes' };
    }

    return { ok: true, orderedTracks, playlistId, totalSeconds };
  }

  if (rawIds.length === 0) {
    return { ok: false, status: 400, error: 'Sélectionne au moins une musique' };
  }

  const tracks = await prisma.track.findMany({
    where: { id: { in: rawIds } },
  });
  const byId = new Map(tracks.map((t) => [t.id, t]));

  const orderedTracks: ResolvedMixTrack[] = [];
  for (const id of rawIds) {
    const t = byId.get(id);
    if (!t) {
      return { ok: false, status: 404, error: 'Une ou plusieurs musiques sont introuvables' };
    }
    if (t.duration == null) {
      return { ok: false, status: 422, error: `Durée inconnue pour « ${t.title} »` };
    }
    orderedTracks.push({
      id: t.id,
      s3Key: t.s3Key,
      s3Url: t.s3Url,
      duration: t.duration,
    });
  }

  const totalSeconds = orderedTracks.reduce((s, t) => s + t.duration, 0);
  if (totalSeconds > MAX_MIX_DURATION_SECONDS) {
    return { ok: false, status: 422, error: 'Le mix ne peut pas dépasser 35 minutes' };
  }

  return { ok: true, orderedTracks, playlistId: null, totalSeconds };
}
