'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

type Track = {
  id: string;
  title: string;
  artist: string | null;
  youtubeUrl: string;
  s3Url: string;
  duration: number | null;
  thumbnail: string | null;
  uploaderId: string | null;
  uploaderName: string | null;
  canDelete: boolean;
  createdAt: Date;
};

export async function getTracks(): Promise<ServerActionResponse<Track[]>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return {
        status: 401,
        error: 'Non autorisé',
      };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return {
        status: 403,
        error: 'Accès refusé',
      };
    }

    const prismaTracks = await prisma.track.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        artist: true,
        youtubeUrl: true,
        s3Url: true,
        duration: true,
        thumbnail: true,
        uploaderId: true,
        uploaderName: true,
        createdAt: true,
      },
    });

    const tracks: Track[] = prismaTracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      youtubeUrl: track.youtubeUrl,
      s3Url: track.s3Url,
      duration: track.duration,
      thumbnail: track.thumbnail,
      uploaderId: track.uploaderId,
      uploaderName: track.uploaderName,
      createdAt: track.createdAt,
      canDelete:
        (!!track.uploaderId && track.uploaderId === userId) ||
        checkRolePermission(role, 'gramophone', 'manage'),
    }));

    return {
      status: 200,
      data: tracks,
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la récupération des tracks');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la récupération des tracks',
    };
  }
}

export async function getTrackById(id: string): Promise<ServerActionResponse<Track>> {
  try {
    const trackId = id?.trim();
    if (!trackId) {
      return {
        status: 400,
        error: 'ID de track manquant',
      };
    }

    const session = await getAuthSession();
    if (!session) {
      return {
        status: 401,
        error: 'Non autorisé',
      };
    }

    const role = session.user.role ?? null;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return {
        status: 403,
        error: 'Accès refusé',
      };
    }

    const prismaTrack = await prisma.track.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        title: true,
        artist: true,
        youtubeUrl: true,
        s3Url: true,
        duration: true,
        thumbnail: true,
        uploaderId: true,
        uploaderName: true,
        createdAt: true,
      },
    });

    if (!prismaTrack) {
      return {
        status: 404,
        error: 'Track introuvable',
      };
    }

    const canDelete =
      (!!prismaTrack.uploaderId && prismaTrack.uploaderId === session.user.id) ||
      checkRolePermission(role, 'gramophone', 'manage');

    return {
      status: 200,
      data: {
        ...prismaTrack,
        canDelete,
      },
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la récupération de la track');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la récupération de la track',
    };
  }
}

export async function deleteTrack(id: string): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return {
        status: 401,
        error: 'Non autorisé',
      };
    }

    const track = await prisma.track.findUnique({
      where: { id },
    });

    if (!track) {
      return {
        status: 404,
        error: 'Track introuvable',
      };
    }

    const role = session.user.role ?? null;
    const isOwner = track.uploaderId && track.uploaderId === session.user.id;
    const canManage = checkRolePermission(role, 'gramophone', 'manage');

    if (!isOwner && !canManage) {
      return {
        status: 403,
        error: 'Vous ne pouvez supprimer que vos propres musiques',
      };
    }

    // We want DB delete to be cancelled if S3 delete fails,
    // so we resolve and delete on S3 *before* deleting the row.

    // Resolve S3 key
    let s3KeyToDelete: string | null = track.s3Key ?? null;

    // Backward compatibility: older tracks may not have s3Key renseigné
    if (!s3KeyToDelete && track.s3Url) {
      try {
        const url = new URL(track.s3Url);
        // pathname starts with '/', remove it
        s3KeyToDelete = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      } catch {
        s3KeyToDelete = null;
      }
    }

    if (s3KeyToDelete) {
      try {
        const result = await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: s3KeyToDelete,
          }),
        );

        const status = result.$metadata.httpStatusCode ?? 0;
        if (status >= 300) {
          throw new Error(
            `Échec de la suppression S3 (code HTTP ${status}) pour la clé ${s3KeyToDelete}`,
          );
        }
      } catch (err) {
        console.error('Failed to delete S3 object for track', track.id, s3KeyToDelete, err);
        // Do not touch DB if file is not removed on S3
        throw err;
      }
    }

    // Only delete from DB if S3 delete above did not throw
    await prisma.track.delete({
      where: { id: track.id },
    });

    return {
      status: 200,
      data: null,
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la suppression de la track');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la suppression de la track',
    };
  }
}
