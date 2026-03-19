'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';
import { z } from 'zod/v3';

const MAX_IMAGE_BYTES = 1_000_000;

const playlistImageSchema = z
  .string()
  .nullable()
  .optional()
  .refine((value) => {
    if (value === undefined || value === null || value.length === 0) return true;

    if (value.startsWith('data:image/')) {
      const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return false;

      const base64 = match[2] ?? '';
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      const bytes = Math.floor((base64.length * 3) / 4) - padding;
      return bytes <= MAX_IMAGE_BYTES;
    }

    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, 'Image invalide (URL ou Data URL base64 <= 1MB)');

const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Le nom de la playlist est requis'),
  description: z.string().optional(),
  image: playlistImageSchema,
});

const updatePlaylistSchema = z.object({
  id: z.string().min(1, 'Playlist introuvable'),
  name: z.string().min(1, 'Le nom de la playlist est requis'),
  description: z.string().optional(),
  image: playlistImageSchema,
});

type PlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  ownerName: string | null;
  tracksCount: number;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  isCollaborator: boolean;
  isPinned: boolean;
};

type PlaylistWithTracks = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  isOwner: boolean;
  isAdminOrDj: boolean;
  isPinned: boolean;
  collaborators: {
    id: string;
    name: string | null;
    email: string | null;
  }[];
  tracks: {
    id: string;
    title: string;
    artist: string | null;
    duration: number | null;
    thumbnail: string | null;
    s3Url: string;
    position: number;
    uploaderName: string | null;
  }[];
};

type PinnedPlaylistSummary = {
  playlistId: string;
  name: string;
  image: string | null;
  createdAt: Date;
};

function canManageGramophone(role: string | null | undefined): boolean {
  return checkRolePermission(role ?? null, 'gramophone', 'manage');
}

function computePlaylistPermissions(options: {
  playlistOwnerId: string;
  userId: string;
  role: string | null | undefined;
  collaboratorsUserIds: string[];
}) {
  const { playlistOwnerId, userId, role, collaboratorsUserIds } = options;
  const isOwner = playlistOwnerId === userId;
  const isAdminOrDj = canManageGramophone(role);
  const isCollaborator = collaboratorsUserIds.includes(userId);

  return {
    canEdit: isOwner || isAdminOrDj || isCollaborator,
    isOwner,
    isAdminOrDj,
  };
}

export async function getPlaylists(): Promise<ServerActionResponse<PlaylistSummary[]>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const playlists = await prisma.playlist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        pinnedBy: {
          where: { userId },
          select: { id: true },
        },
        tracks: {
          select: { id: true },
        },
        collaborators: {
          select: {
            userId: true,
          },
        },
      },
    });

    const summaries: PlaylistSummary[] = playlists.map((pl) => {
      const permissions = computePlaylistPermissions({
        playlistOwnerId: pl.ownerId,
        userId,
        role,
        collaboratorsUserIds: pl.collaborators.map((c) => c.userId),
      });

      return {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        image: pl.image,
        ownerId: pl.ownerId,
        ownerName: pl.owner?.name ?? null,
        tracksCount: pl.tracks.length,
        createdAt: pl.createdAt,
        updatedAt: pl.updatedAt,
        canEdit: permissions.canEdit,
        isCollaborator: pl.collaborators.some((c) => c.userId === userId),
        isPinned: pl.pinnedBy.length > 0,
      };
    });

    return { status: 200, data: summaries };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la récupération des playlists');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la récupération des playlists',
    };
  }
}

export async function getManageablePlaylistsForTrack(
  trackId: string,
): Promise<ServerActionResponse<PlaylistSummary[]>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const playlists = await prisma.playlist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        pinnedBy: {
          where: { userId },
          select: { id: true },
        },
        tracks: {
          select: {
            id: true,
            trackId: true,
          },
        },
        collaborators: {
          select: {
            userId: true,
          },
        },
      },
    });

    const summaries: PlaylistSummary[] = [];

    for (const pl of playlists) {
      const permissions = computePlaylistPermissions({
        playlistOwnerId: pl.ownerId,
        userId,
        role,
        collaboratorsUserIds: pl.collaborators.map((c) => c.userId),
      });

      const alreadyContainsTrack = pl.tracks.some((t) => t.trackId === trackId);

      if (!permissions.canEdit || alreadyContainsTrack) continue;

      summaries.push({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        image: pl.image,
        ownerId: pl.ownerId,
        ownerName: pl.owner?.name ?? null,
        tracksCount: pl.tracks.length,
        createdAt: pl.createdAt,
        updatedAt: pl.updatedAt,
        canEdit: permissions.canEdit,
        isCollaborator: pl.collaborators.some((c) => c.userId === userId),
        isPinned: pl.pinnedBy.length > 0,
      });
    }

    return { status: 200, data: summaries };
  } catch (error) {
    const parsed = actionErrorParser(
      error,
      'Erreur lors de la récupération des playlists disponibles pour cette musique',
    );
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la récupération des playlists disponibles pour cette musique',
    };
  }
}

export async function getPlaylist(id: string): Promise<ServerActionResponse<PlaylistWithTracks>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const pl = await prisma.playlist.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        pinnedBy: {
          where: { userId },
          select: { id: true },
        },
        tracks: {
          orderBy: { position: 'asc' },
          include: {
            track: true,
          },
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!pl) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const collaboratorUserIds = pl.collaborators.map((c) => c.userId);
    const permissions = computePlaylistPermissions({
      playlistOwnerId: pl.ownerId,
      userId,
      role,
      collaboratorsUserIds: collaboratorUserIds,
    });

    const result: PlaylistWithTracks = {
      id: pl.id,
      name: pl.name,
      description: pl.description,
      image: pl.image,
      ownerId: pl.ownerId,
      ownerName: pl.owner?.name ?? null,
      ownerEmail: pl.owner?.email ?? null,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt,
      canEdit: permissions.canEdit,
      isOwner: permissions.isOwner,
      isAdminOrDj: permissions.isAdminOrDj,
      isPinned: pl.pinnedBy.length > 0,
      collaborators: pl.collaborators.map((c) => ({
        id: c.user.id,
        name: c.user.name,
        email: c.user.email,
      })),
      tracks: pl.tracks.map((pt) => ({
        id: pt.track.id,
        title: pt.track.title,
        artist: pt.track.artist,
        duration: pt.track.duration,
        thumbnail: pt.track.thumbnail,
        s3Url: pt.track.s3Url,
        position: pt.position,
        uploaderName: pt.track.uploaderName,
      })),
    };

    return { status: 200, data: result };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la récupération de la playlist');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la récupération de la playlist',
    };
  }
}

export async function getPinnedPlaylists(): Promise<
  ServerActionResponse<PinnedPlaylistSummary[]>
> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const pins = await prisma.pinnedPlaylist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return {
      status: 200,
      data: pins.map((p) => ({
        playlistId: p.playlist.id,
        name: p.playlist.name,
        image: p.playlist.image,
        createdAt: p.createdAt,
      })),
    };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la récupération des playlists épinglées');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la récupération des playlists épinglées',
    };
  }
}

export async function togglePinnedPlaylist(
  playlistId: string,
): Promise<ServerActionResponse<{ pinned: boolean }>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const userId = session.user.id;

    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const validated = z
      .string()
      .min(1, 'Playlist introuvable')
      .parse(playlistId);

    const playlistExists = await prisma.playlist.findUnique({
      where: { id: validated },
      select: { id: true },
    });
    if (!playlistExists) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const existing = await prisma.pinnedPlaylist.findUnique({
      where: { userId_playlistId: { userId, playlistId: validated } },
      select: { id: true },
    });

    if (existing) {
      await prisma.pinnedPlaylist.delete({
        where: { id: existing.id },
      });
      return { status: 200, data: { pinned: false } };
    }

    await prisma.pinnedPlaylist.create({
      data: {
        userId,
        playlistId: validated,
      },
    });

    return { status: 200, data: { pinned: true } };
  } catch (error) {
    const parsed = actionErrorParser(error, "Erreur lors de la mise à jour de l'épinglage");
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string' ? parsed.error : "Erreur lors de la mise à jour de l'épinglage",
    };
  }
}

export async function createPlaylist(
  name: string,
  description?: string,
  image?: string | null,
): Promise<ServerActionResponse<PlaylistSummary>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const validated = createPlaylistSchema.parse({ name, description, image });
    const trimmedName = validated.name.trim();
    if (!trimmedName) return { status: 400, error: 'Le nom de la playlist est requis' };

    const playlist = await prisma.playlist.create({
      data: {
        name: trimmedName,
        description: validated.description?.trim() || null,
        image: validated.image === '' ? null : (validated.image ?? null),
        ownerId: session.user.id,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
        tracks: true,
      },
    });

    const summary: PlaylistSummary = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      image: playlist.image,
      ownerId: playlist.ownerId,
      ownerName: playlist.owner?.name ?? null,
      tracksCount: playlist.tracks.length,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      canEdit: true,
      isCollaborator: false,
      isPinned: false,
    };

    return { status: 200, data: summary };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la création de la playlist');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la création de la playlist',
    };
  }
}

export async function updatePlaylist(data: {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
}): Promise<ServerActionResponse<PlaylistWithTracks>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return { status: 403, error: 'Accès refusé' };
    }

    const validated = updatePlaylistSchema.parse(data);
    const trimmedName = validated.name.trim();
    if (!trimmedName) {
      return { status: 400, error: 'Le nom de la playlist est requis' };
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: validated.id },
      include: {
        collaborators: true,
      },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const permissions = computePlaylistPermissions({
      playlistOwnerId: playlist.ownerId,
      userId: session.user.id,
      role,
      collaboratorsUserIds: playlist.collaborators.map((c) => c.userId),
    });

    if (!permissions.isOwner && !permissions.isAdminOrDj) {
      return {
        status: 403,
        error: 'Vous ne pouvez modifier que vos propres playlists',
      };
    }

    await prisma.playlist.update({
      where: { id: validated.id },
      data: {
        name: trimmedName,
        description: validated.description?.trim() || null,
        image: validated.image === '' ? null : (validated.image ?? null),
      },
    });

    return await getPlaylist(validated.id);
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la mise à jour de la playlist');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la mise à jour de la playlist',
    };
  }
}

export async function deletePlaylist(id: string): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;

    const playlist = await prisma.playlist.findUnique({
      where: { id },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const isOwner = playlist.ownerId === session.user.id;
    const canManage = canManageGramophone(role);

    if (!isOwner && !canManage) {
      return {
        status: 403,
        error: 'Vous ne pouvez modifier que vos propres playlists',
      };
    }

    await prisma.playlist.delete({
      where: { id },
    });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la suppression de la playlist');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors de la suppression de la playlist',
    };
  }
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        tracks: true,
        collaborators: true,
      },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const permissions = computePlaylistPermissions({
      playlistOwnerId: playlist.ownerId,
      userId: session.user.id,
      role: session.user.role ?? null,
      collaboratorsUserIds: playlist.collaborators.map((c) => c.userId),
    });

    if (!permissions.canEdit) {
      return {
        status: 403,
        error: 'Vous ne pouvez modifier que vos propres playlists',
      };
    }

    const track = await prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track) {
      return { status: 404, error: 'Track introuvable' };
    }

    const alreadyIn = playlist.tracks.some((t) => t.trackId === trackId);
    if (alreadyIn) {
      return {
        status: 400,
        error: 'Cette musique est déjà dans la playlist',
      };
    }

    const nextPosition =
      playlist.tracks.length === 0
        ? 1
        : Math.max(...playlist.tracks.map((t) => t.position)) + 1;

    await prisma.playlistTrack.create({
      data: {
        playlistId,
        trackId,
        position: nextPosition,
      },
    });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, "Erreur lors de l'ajout de la musique à la playlist");
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : "Erreur lors de l'ajout de la musique à la playlist",
    };
  }
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: true,
      },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const permissions = computePlaylistPermissions({
      playlistOwnerId: playlist.ownerId,
      userId: session.user.id,
      role,
      collaboratorsUserIds: playlist.collaborators.map((c) => c.userId),
    });

    if (!permissions.canEdit) {
      return {
        status: 403,
        error: 'Vous ne pouvez modifier que vos propres playlists',
      };
    }

    await prisma.playlistTrack.deleteMany({
      where: {
        playlistId,
        trackId,
      },
    });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du retrait de la musique de la playlist');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error:
        typeof parsed.error === 'string'
          ? parsed.error
          : 'Erreur lors du retrait de la musique de la playlist',
    };
  }
}

export async function addCollaborator(
  playlistId: string,
  userEmail: string,
): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: true,
      },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const permissions = computePlaylistPermissions({
      playlistOwnerId: playlist.ownerId,
      userId: session.user.id,
      role,
      collaboratorsUserIds: playlist.collaborators.map((c) => c.userId),
    });

    if (!permissions.isOwner && !permissions.isAdminOrDj) {
      return {
        status: 403,
        error: 'Seul le propriétaire ou un administrateur peut gérer les collaborateurs',
      };
    }

    const trimmedEmail = userEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      return { status: 400, error: "L'email de l'utilisateur est requis" };
    }

    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return { status: 404, error: "Utilisateur introuvable avec cet email" };
    }

    const alreadyCollaborator = playlist.collaborators.some((c) => c.userId === user.id);
    if (alreadyCollaborator || user.id === playlist.ownerId) {
      return { status: 400, error: 'Cet utilisateur a déjà accès à la playlist' };
    }

    await prisma.playlistCollaborator.create({
      data: {
        playlistId: playlist.id,
        userId: user.id,
      },
    });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la gestion des collaborateurs');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la gestion des collaborateurs',
    };
  }
}

export async function removeCollaborator(
  playlistId: string,
  userId: string,
): Promise<ServerActionResponse<null>> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: true,
      },
    });

    if (!playlist) {
      return { status: 404, error: 'Playlist introuvable' };
    }

    const permissions = computePlaylistPermissions({
      playlistOwnerId: playlist.ownerId,
      userId: session.user.id,
      role,
      collaboratorsUserIds: playlist.collaborators.map((c) => c.userId),
    });

    if (!permissions.isOwner && !permissions.isAdminOrDj) {
      return {
        status: 403,
        error: 'Seul le propriétaire ou un administrateur peut gérer les collaborateurs',
      };
    }

    await prisma.playlistCollaborator.deleteMany({
      where: {
        playlistId,
        userId,
      },
    });

    return { status: 200, data: null };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la gestion des collaborateurs');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la gestion des collaborateurs',
    };
  }
}
