const FALLBACK_MIX_MP3_BITRATE = '128k';

function parseMixMp3Bitrate(raw: string): string | null {
  if (/^\d+k$/i.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

/** Default stereo bitrate when MIX_MP3_BITRATE is unset. Env: MIX_MP3_DEFAULT_BITRATE (e.g. 128k). */
function resolveDefaultMixMp3Bitrate(): string {
  const fromEnv = process.env.MIX_MP3_DEFAULT_BITRATE?.trim();
  if (fromEnv) {
    const parsed = parseMixMp3Bitrate(fromEnv);
    if (parsed) return parsed;
  }
  return FALLBACK_MIX_MP3_BITRATE;
}

function resolveMixMp3Bitrate(): string {
  const raw = process.env.MIX_MP3_BITRATE?.trim();
  if (!raw) return resolveDefaultMixMp3Bitrate();
  const parsed = parseMixMp3Bitrate(raw);
  if (parsed) return parsed;
  return resolveDefaultMixMp3Bitrate();
}

function resolveMixMp3MonoBitrateOverride(): string | null {
  const raw = process.env.MIX_MP3_MONO_BITRATE?.trim();
  if (!raw) return null;
  if (/^\d+k$/i.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

function isMixMp3MonoSameBitrateAsStereo(): boolean {
  const v = process.env.MIX_MP3_MONO_SAME_BITRATE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Half bitrate for mono so file size drops (CBR stereo vs mono at same -b:a is ~same size). */
function effectiveBitrateForChannels(stereoBitrate: string, channels: 1 | 2): string {
  if (channels === 2) return stereoBitrate;

  const override = resolveMixMp3MonoBitrateOverride();
  if (override) return override;
  if (isMixMp3MonoSameBitrateAsStereo()) return stereoBitrate;

  if (/^\d+k$/i.test(stereoBitrate)) {
    const n = parseInt(stereoBitrate, 10);
    const half = Math.max(48, Math.round(n / 2));
    return `${half}k`;
  }
  if (/^\d+$/.test(stereoBitrate)) {
    const n = parseInt(stereoBitrate, 10);
    return String(Math.max(48_000, Math.round(n / 2)));
  }
  return stereoBitrate;
}

/** 2 = stereo (default), 1 = mono */
function resolveMixMp3ChannelCount(): 1 | 2 {
  const raw = process.env.MIX_MP3_CHANNELS?.trim().toLowerCase();
  if (!raw) return 2;
  if (raw === '1' || raw === 'mono') return 1;
  if (raw === '2' || raw === 'stereo') return 2;
  return 2;
}

export function buildFfmpegLocalConcatArgs(inputPaths: string[], outputPath: string): string[] {
  const inputArgs = inputPaths.flatMap((p) => ['-i', p]);
  const n = inputPaths.length;
  const concatInputs = inputPaths.map((_, index) => `[${index}:a]`).join('');
  const filterComplex = `${concatInputs}concat=n=${n}:v=0:a=1[aout]`;
  const channels = resolveMixMp3ChannelCount();
  const bitrate = effectiveBitrateForChannels(resolveMixMp3Bitrate(), channels);

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[aout]',
    '-ac',
    String(channels),
    '-c:a',
    'libmp3lame',
    '-b:a',
    bitrate,
    '-y',
    outputPath,
  ];
}
