export function getMixesPrefix(): string {
  return (process.env.MIXES_S3_PREFIX ?? 'mixes').replace(/^\/+|\/+$/g, '');
}

export function getMixBucketRegion(): { bucket: string; region: string } {
  return {
    bucket: process.env.AWS_S3_BUCKET!,
    region: process.env.AWS_REGION!,
  };
}

export function buildMixS3Key(mixId: string): string {
  return `${getMixesPrefix()}/${mixId}.mp3`;
}

export function buildMixS3Url(bucket: string, region: string, s3Key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}
