'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';

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

export async function downloadTrack(url: string): Promise<ServerActionResponse<{ track: Track; cached: boolean }>> {
  try {
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

    if (!url || !url.trim()) {
      return {
        status: 400,
        error: 'URL manquante',
      };
    }

    const youtubeId = extractYoutubeId(url.trim());
    if (!youtubeId) {
      return {
        status: 400,
        error: 'URL YouTube invalide',
      };
    }

    const existing = await prisma.track.findUnique({ where: { youtubeId } });
    if (existing) {
      const userId = session.user.id;

      return {
        status: 200,
        data: {
          track: {
            id: existing.id,
            title: existing.title,
            artist: existing.artist,
            youtubeUrl: existing.youtubeUrl,
            s3Url: existing.s3Url,
            duration: existing.duration,
            thumbnail: existing.thumbnail,
            uploaderId: existing.uploaderId,
            uploaderName: existing.uploaderName,
            createdAt: existing.createdAt,
            canDelete:
              (!!existing.uploaderId && existing.uploaderId === userId) ||
              checkRolePermission(session.user.role ?? null, 'gramophone', 'manage'),
          },
          cached: true,
        },
      };
    }


    const tmpDir = os.tmpdir();
    const outputTemplate = path.join(tmpDir, `${youtubeId}.%(ext)s`);
    const mp3Path = path.join(tmpDir, `${youtubeId}.mp3`);

    const ytDlpCommand = await findYtDlpCommand();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : undefined;

    try {
      let metaRaw: string;
      try {
        const command = `${ytDlpCommand} --dump-json --no-playlist "${url.trim()}"`;
        const result = await execAsync(command, {
          shell,
          maxBuffer: 10 * 1024 * 1024,
        });
        metaRaw = result.stdout;
        console.log(metaRaw);
      } catch (err: any) {
        const errorMessage = err.message || err.stderr || String(err);
        console.log(err);
        console.log(errorMessage);
        if (
          errorMessage.includes("n'est pas reconnu") ||
          errorMessage.includes('not recognized') ||
          errorMessage.includes('command not found') ||
          errorMessage.includes('ENOENT') ||
          errorMessage.includes('Cannot find')
        ) {
          throw new Error(
            'yt-dlp n\'est pas installé ou n\'est pas dans le PATH. Veuillez installer yt-dlp pour utiliser cette fonctionnalité. Sur Windows, assurez-vous que yt-dlp.exe est dans votre PATH système.'
          );
        }
        throw err;
      }

      const meta = JSON.parse(metaRaw);

      // Also prevent duplicate titles (same name means it's already present)
      if (meta.title) {
        const existingByTitle = await prisma.track.findFirst({
          where: { title: { equals: meta.title, mode: 'insensitive' } },
        });
        if (existingByTitle) {
          return {
            status: 400,
            error: 'Une musique avec ce nom existe déjà dans la bibliothèque',
          };
        }
      }

      try {
        const command = `${ytDlpCommand} -x --audio-format mp3 --audio-quality 0 --no-playlist -o "${outputTemplate}" "${url.trim()}"`;
        await execAsync(command, {
          shell,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (err: any) {
        const errorMessage = err.message || err.stderr || String(err);
        console.log(errorMessage);
        if (
          errorMessage.includes("n'est pas reconnu") ||
          errorMessage.includes('not recognized') ||
          errorMessage.includes('command not found') ||
          errorMessage.includes('ENOENT') ||
          errorMessage.includes('Cannot find')
        ) {
          throw new Error(
            'yt-dlp n\'est pas installé ou n\'est pas dans le PATH. Veuillez installer yt-dlp pour utiliser cette fonctionnalité. Sur Windows, assurez-vous que yt-dlp.exe est dans votre PATH système.'
          );
        }
        throw new Error(`Erreur lors du téléchargement: ${errorMessage}`);
      }

      if (!fs.existsSync(mp3Path)) {
        throw new Error('Fichier MP3 introuvable après conversion');
      }

      const s3Key = `tracks/${youtubeId}.mp3`;
      const fileBuffer = fs.readFileSync(mp3Path);

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: 'audio/mpeg',
        })
      );

      const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      const track = await prisma.track.create({
        data: {
          title: meta.title,
          artist: meta.uploader ?? meta.channel ?? null,
          youtubeUrl: url.trim(),
          youtubeId,
          s3Key,
          s3Url,
          duration: meta.duration ?? null,
          thumbnail: meta.thumbnail ?? null,
          uploaderId: session.user.id,
          uploaderName: session.user.name ?? null,
        },
      });

      fs.unlinkSync(mp3Path);

      return {
        status: 200,
        data: {
          track: {
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
              (!!track.uploaderId && track.uploaderId === session.user.id) ||
              checkRolePermission(session.user.role ?? null, 'gramophone', 'manage'),
          },
          cached: false,
        },
      };
    } catch (err: any) {
      if (fs.existsSync(mp3Path)) {
        fs.unlinkSync(mp3Path);
      }
      throw err;
    }
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du téléchargement de la track');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du téléchargement de la track',
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
