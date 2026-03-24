const DEFAULT_MIX_MP3_BITRATE = '128k';

function resolveMixMp3Bitrate(): string {
  const raw = process.env.MIX_MP3_BITRATE?.trim();
  if (!raw) return DEFAULT_MIX_MP3_BITRATE;
  if (/^\d+k$/i.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return raw;
  return DEFAULT_MIX_MP3_BITRATE;
}

export function buildFfmpegLocalConcatArgs(inputPaths: string[], outputPath: string): string[] {
  const inputArgs = inputPaths.flatMap((p) => ['-i', p]);
  const n = inputPaths.length;
  const concatInputs = inputPaths.map((_, index) => `[${index}:a]`).join('');
  const filterComplex = `${concatInputs}concat=n=${n}:v=0:a=1[aout]`;
  const bitrate = resolveMixMp3Bitrate();

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[aout]',
    '-c:a',
    'libmp3lame',
    '-b:a',
    bitrate,
    '-y',
    outputPath,
  ];
}
