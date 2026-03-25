import prisma from '@/lib/prisma';
import { buildMixS3Key } from '@/lib/mixes/mixConfig';
import { deleteObjectFromBucket, resolveS3KeyFromStoredFields } from '@/lib/s3/deleteObject';

export type MixS3Fields = {
  id: string;
  s3Key: string;
  s3Url: string;
};

export async function deleteMixArtifacts(mix: MixS3Fields): Promise<void> {
  const s3KeyToDelete =
    resolveS3KeyFromStoredFields(mix.s3Key, mix.s3Url) ?? buildMixS3Key(mix.id);

  await deleteObjectFromBucket({ key: s3KeyToDelete, logContext: `mix ${mix.id}` });

  await prisma.mix.delete({ where: { id: mix.id } });
}

export type CleanupExpiredMixesResult = {
  deletedIds: string[];
  failures: { id: string; error: string }[];
};

/**
 * Deletes non-persistent mixes whose expiresAt is strictly before now (S3 first, then DB).
 */
export async function cleanupExpiredNonPersistentMixes(): Promise<CleanupExpiredMixesResult> {
  const now = new Date();

  const expired = await prisma.mix.findMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, s3Key: true, s3Url: true },
  });

  const deletedIds: string[] = [];
  const failures: { id: string; error: string }[] = [];

  for (const m of expired) {
    try {
      await deleteMixArtifacts(m);
      deletedIds.push(m.id);
    } catch (e: unknown) {
      failures.push({
        id: m.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { deletedIds, failures };
}
