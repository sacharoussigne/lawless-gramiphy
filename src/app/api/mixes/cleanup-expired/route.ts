import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { actionErrorParser } from '@/lib/action';
import { cleanupExpiredNonPersistentMixes } from '@/lib/mixes/deleteMixArtifacts';

/**
 * Protected by `MIX_CLEANUP_CRON_SECRET` (Bearer token).
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.MIX_CLEANUP_CRON_SECRET?.trim();
    if (!cronSecret) {
      return NextResponse.json(
        { status: 500, error: 'MIX_CLEANUP_CRON_SECRET n’est pas configuré' },
        { status: 500 },
      );
    }

    const bearer = request.headers.get('authorization');
    const token = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length).trim() : '';
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(cronSecret, 'utf8');
    const tokenOk = a.length === b.length && timingSafeEqual(a, b);
    if (!tokenOk) {
      return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
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
