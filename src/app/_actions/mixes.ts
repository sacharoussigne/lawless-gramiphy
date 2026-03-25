'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';
import { buildMixS3Key } from '@/lib/mixes/mixConfig';
import { deleteObjectFromBucket, resolveS3KeyFromStoredFields } from '@/lib/s3/deleteObject';

export type MixSummary = {
  id: string;
  name: string;
  creatorName: string | null;
  tracksCount: number;
  totalDurationSeconds: number;
  fileSizeMb: number;
  expiresAt: Date | null;
  s3Url: string;
  createdAt: Date;
  canDelete: boolean;
};

export type MixWithTracks = {
  id: string;
  name: string;
  creatorName: string | null;
  totalDurationSeconds: number;
  fileSizeMb: number;
  expiresAt: Date | null;
  s3Url: string;
  createdAt: Date;
  canDelete: boolean;
  tracks: {
    id: string;
    title: string;
    artist: string | null;
    youtubeUrl: string;
    duration: number | null;
    thumbnail: string | null;
    s3Url: string;
    uploaderName: string | null;
    position: number;
  }[];
};

export async function getMixes(): Promise<ServerActionResponse<MixSummary[]>> {
  try {
    const session = await getAuthSession();
    if (!session) return { status: 401, error: 'Non autorisé' };

    const role = session.user.role ?? null;
    if (!checkRolePermission(role, 'gramophone', 'access')) {
      return { status: 403, error: 'Accès refusé' };
    }

    const canManage = checkRolePermission(role, 'gramophone', 'manage');

    const mixes = await prisma.mix.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tracks: { select: { id: true } },
        user: { select: { name: true } },
      },
    });

    return {
      status: 200,
      data: mixes.map((m) => ({
        id: m.id,
        name: m.name,
        creatorName: m.user?.name ?? null,
        tracksCount: m.tracks.length,
        totalDurationSeconds: m.totalDurationSeconds,
        fileSizeMb: m.fileSizeMb,
        expiresAt: m.expiresAt,
        s3Url: m.s3Url,
        createdAt: m.createdAt,
        canDelete: m.userId === session.user.id || canManage,
      })),
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du chargement des mixes');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du chargement des mixes',
    };
  }
}

export async function getMix(id: string): Promise<ServerActionResponse<MixWithTracks>> {
  try {
    const session = await getAuthSession();
    if (!session) return { status: 401, error: 'Non autorisé' };

    const role = session.user.role ?? null;
    if (!checkRolePermission(role, 'gramophone', 'access')) {
      return { status: 403, error: 'Accès refusé' };
    }

    const canManage = checkRolePermission(role, 'gramophone', 'manage');

    const mix = await prisma.mix.findFirst({
      where: { id },
      include: {
        user: { select: { name: true } },
        tracks: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    });

    if (!mix) return { status: 404, error: 'Mix introuvable' };

    const canDelete = mix.userId === session.user.id || canManage;

    return {
      status: 200,
      data: {
        id: mix.id,
        name: mix.name,
        creatorName: mix.user?.name ?? null,
        totalDurationSeconds: mix.totalDurationSeconds,
        fileSizeMb: mix.fileSizeMb,
        expiresAt: mix.expiresAt,
        s3Url: mix.s3Url,
        createdAt: mix.createdAt,
        canDelete,
        tracks: mix.tracks.map((mt) => ({
          id: mt.track.id,
          title: mt.track.title,
          artist: mt.track.artist ?? null,
          youtubeUrl: mt.track.youtubeUrl,
          duration: mt.track.duration ?? null,
          thumbnail: mt.track.thumbnail ?? null,
          s3Url: mt.track.s3Url,
          uploaderName: mt.track.uploaderName ?? null,
          position: mt.position,
        })),
      },
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du chargement du mix');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du chargement du mix',
    };
  }
}

const MIX_NAME_MAX = 200;

export async function updateMixName(
  id: string,
  name: string,
): Promise<ServerActionResponse<{ name: string }>> {
  try {
    const session = await getAuthSession();
    if (!session) return { status: 401, error: 'Non autorisé' };

    const role = session.user.role ?? null;
    if (!checkRolePermission(role, 'gramophone', 'access')) {
      return { status: 403, error: 'Accès refusé' };
    }

    const mixId = id?.trim();
    if (!mixId) return { status: 400, error: 'Mix introuvable' };

    const trimmed = name.trim();
    if (!trimmed) return { status: 422, error: 'Le nom ne peut pas être vide' };
    if (trimmed.length > MIX_NAME_MAX) {
      return { status: 422, error: `Le nom ne peut pas dépasser ${MIX_NAME_MAX} caractères` };
    }

    const mix = await prisma.mix.findUnique({ where: { id: mixId } });
    if (!mix) return { status: 404, error: 'Mix introuvable' };

    const canManage = checkRolePermission(role, 'gramophone', 'manage');
    const isOwner = mix.userId === session.user.id;
    if (!isOwner && !canManage) {
      return { status: 403, error: 'Accès refusé' };
    }

    const updated = await prisma.mix.update({
      where: { id: mixId },
      data: { name: trimmed },
      select: { name: true },
    });

    return { status: 200, data: { name: updated.name } };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la mise à jour du nom');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la mise à jour du nom',
    };
  }
}

export async function deleteMix(id: string): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) return { status: 401, error: 'Non autorisé' };

    const role = session.user.role ?? null;
    if (!checkRolePermission(role, 'gramophone', 'access')) {
      return { status: 403, error: 'Accès refusé' };
    }

    const mixId = id?.trim();
    if (!mixId) return { status: 400, error: 'Mix introuvable' };

    const mix = await prisma.mix.findUnique({ where: { id: mixId } });
    if (!mix) return { status: 404, error: 'Mix introuvable' };

    const canManage = checkRolePermission(role, 'gramophone', 'manage');
    const isOwner = mix.userId === session.user.id;
    if (!isOwner && !canManage) {
      return { status: 403, error: 'Accès refusé' };
    }

    // Same principle as deleteTrack: delete the file on S3 first; abort DB delete if S3 fails.

    const s3KeyToDelete =
      resolveS3KeyFromStoredFields(mix.s3Key, mix.s3Url) ?? buildMixS3Key(mix.id);

    await deleteObjectFromBucket({ key: s3KeyToDelete, logContext: `mix ${mix.id}` });

    await prisma.mix.delete({ where: { id: mixId } });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la suppression du mix');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la suppression du mix',
    };
  }
}

