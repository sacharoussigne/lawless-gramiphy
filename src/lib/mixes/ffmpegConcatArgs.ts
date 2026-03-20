export function buildFfmpegLocalConcatArgs(inputPaths: string[], outputPath: string): string[] {
  const inputArgs = inputPaths.flatMap((p) => ['-i', p]);
  const n = inputPaths.length;
  const concatInputs = inputPaths.map((_, index) => `[${index}:a]`).join('');
  const filterComplex = `${concatInputs}concat=n=${n}:v=0:a=1[aout]`;

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
    '192k',
    '-y',
    outputPath,
  ];
}
