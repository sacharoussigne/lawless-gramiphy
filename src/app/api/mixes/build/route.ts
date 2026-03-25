import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { actionErrorParser } from '@/lib/action';
import { auth } from '@/lib/auth';
import { checkRolePermission } from '@/lib/auth/permissions';
import {
  createMixJob,
  getMixJob,
  removeMixJob,
  setMixJob,
  toPublicMixJob,
} from '@/lib/mixes/mixJobs';
import { resolveMixTracksForBuild } from '@/lib/mixes/resolveMixTracks';
import { runExportedMixJob } from '@/lib/mixes/runExportedMixJob';

const bodySchema = z.object({
  playlistId: z.string().optional().nullable(),
  trackIds: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
    }

    const role = session.user.role ?? null;
    const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
    if (!hasGramophoneAccess) {
      return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = bodySchema.parse(body);

    const resolved = await resolveMixTracksForBuild({
      playlistId: validated.playlistId ?? undefined,
      trackIds: validated.trackIds,
    });

    if (!resolved.ok) {
      return NextResponse.json({ status: resolved.status, error: resolved.error }, { status: resolved.status });
    }

    const jobId = `mix_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    createMixJob({ jobId, userId: session.user.id });

    void runExportedMixJob({
      jobId,
      userId: session.user.id,
      orderedTracks: resolved.orderedTracks,
      totalSeconds: resolved.totalSeconds,
    });

    return NextResponse.json({ status: 200, data: { jobId } }, { status: 200 });
  } catch (error) {
    const parsed = actionErrorParser(error, 'Erreur lors de la création du mix');
    return NextResponse.json(
      {
        status: parsed.status,
        error: typeof parsed.error === 'string' ? parsed.error : 'Erreur lors de la création du mix',
      },
      { status: parsed.status },
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
  }

  const role = session.user.role ?? null;
  const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
  if (!hasGramophoneAccess) {
    return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ status: 400, error: 'jobId manquant' }, { status: 400 });
  }

  const job = getMixJob(jobId);
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ status: 404, error: 'Job introuvable' }, { status: 404 });
  }

  return NextResponse.json({ status: 200, data: toPublicMixJob(job) }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: 401, error: 'Non autorisé' }, { status: 401 });
  }

  const role = session.user.role ?? null;
  const hasGramophoneAccess = checkRolePermission(role, 'gramophone', 'access');
  if (!hasGramophoneAccess) {
    return NextResponse.json({ status: 403, error: 'Accès refusé' }, { status: 403 });
  }

  const jobId = request.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ status: 400, error: 'jobId manquant' }, { status: 400 });
  }

  const job = getMixJob(jobId);
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ status: 404, error: 'Job introuvable' }, { status: 404 });
  }

  if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
    return NextResponse.json({ status: 200, data: toPublicMixJob(job) }, { status: 200 });
  }

  try {
    job.child?.kill('SIGKILL');
  } catch {
    // ignore
  }

  setMixJob(jobId, { status: 'canceled', message: 'Annulé', child: null });
  setTimeout(() => removeMixJob(jobId), 30_000);

  const updated = getMixJob(jobId);
  return NextResponse.json({ status: 200, data: updated ? toPublicMixJob(updated) : null }, { status: 200 });
}
