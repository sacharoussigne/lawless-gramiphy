'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';

export type MixSummary = {
  id: string;
  tracksCount: number;
  totalDurationSeconds: number;
  fileSizeMb: number;
  expiresAt: Date | null;
  s3Url: string;
  createdAt: Date;
};

export type MixWithTracks = {
  id: string;
  totalDurationSeconds: number;
  fileSizeMb: number;
  expiresAt: Date | null;
  s3Url: string;
  createdAt: Date;
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

    const mixes = await prisma.mix.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        tracks: { select: { id: true } },
      },
    });

    return {
      status: 200,
      data: mixes.map((m) => ({
        id: m.id,
        tracksCount: m.tracks.length,
        totalDurationSeconds: m.totalDurationSeconds,
        fileSizeMb: m.fileSizeMb,
        expiresAt: m.expiresAt,
        s3Url: m.s3Url,
        createdAt: m.createdAt,
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

    const mix = await prisma.mix.findFirst({
      where: { id, userId: session.user.id },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    });

    if (!mix) return { status: 404, error: 'Mix introuvable' };

    return {
      status: 200,
      data: {
        id: mix.id,
        totalDurationSeconds: mix.totalDurationSeconds,
        fileSizeMb: mix.fileSizeMb,
        expiresAt: mix.expiresAt,
        s3Url: mix.s3Url,
        createdAt: mix.createdAt,
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

