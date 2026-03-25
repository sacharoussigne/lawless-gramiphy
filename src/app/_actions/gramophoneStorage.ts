'use server';

import prisma from '@/lib/prisma';
import { actionErrorParser } from '@/lib/action';
import { getAuthSession } from '@/lib/auth';
import type { ServerActionResponse } from '@/types/api';
import { checkRolePermission } from '@/lib/auth/permissions';

export type GramophoneUserStorageRow = {
  userId: string;
  userName: string | null;
  trackBytes: number;
  mixBytesApprox: number;
  totalBytes: number;
  trackCount: number;
  mixCount: number;
};

export async function getGramophoneStorageByUser(): Promise<
  ServerActionResponse<GramophoneUserStorageRow[]>
> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: 401, error: 'Non autorisé' };
    }

    const role = session.user.role ?? null;
    if (!checkRolePermission(role, 'gramophone', 'manage')) {
      return { status: 403, error: 'Accès refusé' };
    }

    const [trackAgg, mixAgg] = await Promise.all([
      prisma.track.groupBy({
        by: ['uploaderId'],
        where: { uploaderId: { not: null } },
        _sum: { fileSizeMb: true },
        _count: { id: true },
      }),
      prisma.mix.groupBy({
        by: ['userId'],
        _sum: { fileSizeMb: true },
        _count: { id: true },
      }),
    ]);

    const map = new Map<
      string,
      { trackBytes: number; mixBytesApprox: number; trackCount: number; mixCount: number }
    >();

    for (const row of trackAgg) {
      if (!row.uploaderId) continue;
      const trackMb = row._sum.fileSizeMb ?? 0;
      map.set(row.uploaderId, {
        trackBytes: Math.round(trackMb * 1024 * 1024),
        trackCount: row._count.id,
        mixBytesApprox: 0,
        mixCount: 0,
      });
    }

    for (const row of mixAgg) {
      const mb = row._sum.fileSizeMb ?? 0;
      const approxBytes = Math.round(mb * 1024 * 1024);
      const cur = map.get(row.userId) ?? {
        trackBytes: 0,
        trackCount: 0,
        mixBytesApprox: 0,
        mixCount: 0,
      };
      cur.mixBytesApprox += approxBytes;
      cur.mixCount += row._count.id;
      map.set(row.userId, cur);
    }

    const userIds = [...map.keys()];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const rows: GramophoneUserStorageRow[] = userIds.map((userId) => {
      const v = map.get(userId)!;
      return {
        userId,
        userName: nameById.get(userId) ?? null,
        trackBytes: v.trackBytes,
        mixBytesApprox: v.mixBytesApprox,
        totalBytes: v.trackBytes + v.mixBytesApprox,
        trackCount: v.trackCount,
        mixCount: v.mixCount,
      };
    });

    rows.sort((a, b) => b.totalBytes - a.totalBytes);

    return { status: 200, data: rows };
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors du calcul du stockage');
    return {
      status: parsed.status as 400 | 401 | 403 | 404 | 422 | 500,
      error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du calcul du stockage',
    };
  }
}
