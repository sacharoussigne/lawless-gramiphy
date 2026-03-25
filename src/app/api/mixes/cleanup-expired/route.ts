import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/auth/permissions';
import { actionErrorParser } from '@/lib/action';
import { cleanupExpiredNonPersistentMixes } from '@/lib/mixes/deleteMixArtifacts';

/**
 * - If `MIX_CLEANUP_CRON_SECRET` is set: only `Authorization: Bearer <secret>` is accepted (no cookie session).
 * - If unset: only an admin session (cookies via `headers()`) is accepted.
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.MIX_CLEANUP_CRON_SECRET?.trim();

    if (cronSecret) {
      const bearer = request.headers.get('authorization');
      const token =
        bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length).trim() : '';
      const a = Buffer.from(token, 'utf8');
      const b = Buffer.from(cronSecret, 'utf8');
      const tokenOk = a.length === b.length && timingSafeEqual(a, b);
      if (!tokenOk) {
        return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
      }
    } else {
      const h = await headers();
      const session = await auth.api.getSession({ headers: h });
      if (!session) {
        return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
      }

      const role = session.user.role ?? null;
      if (!hasRole(role, 'admin')) {
        return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
      }
    }

    const result = await cleanupExpiredNonPersistentMixes();

    return NextResponse.json(
      {
        status: 200,
        data: {
          deletedCount: result.deletedIds.length,
          deletedIds: result.deletedIds,
          failures: result.failures,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const parsed = actionErrorParser(error, 'Erreur lors du nettoyage des mixes expirés');
    return NextResponse.json(
      {
        status: parsed.status,
        error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors du nettoyage des mixes expirés',
      },
      { status: typeof parsed.status === 'number' ? parsed.status : 500 },
    );
  }
}
