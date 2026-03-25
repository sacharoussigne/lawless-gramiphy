import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/**
 * Resolves the S3 object key from a stored `s3Key` and/or public `s3Url` (virtual-hosted style).
 */
export function resolveS3KeyFromStoredFields(
  s3Key: string | null | undefined,
  s3Url: string | null | undefined,
): string | null {
  if (s3Key != null && s3Key !== '') return s3Key;

  if (!s3Url) return null;

  try {
    const url = new URL(s3Url);
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } catch {
    return null;
  }
}

/**
 * Deletes one object from S3. Throws on failure (same contract as track/mix server actions: DB delete should not run after).
 */
export async function deleteObjectFromBucket(options: {
  key: string;
  bucket?: string;
  logContext?: string;
}): Promise<void> {
  const bucket = options.bucket ?? process.env.AWS_S3_BUCKET!;
  const { key } = options;

  try {
    const result = await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const status = result.$metadata.httpStatusCode ?? 0;
    if (status >= 300) {
      throw new Error(`Échec de la suppression S3 (code HTTP ${status}) pour la clé ${key}`);
    }
  } catch (err) {
    console.error('Failed to delete S3 object', key, options.logContext ?? '', err);
    throw err;
  }
}
