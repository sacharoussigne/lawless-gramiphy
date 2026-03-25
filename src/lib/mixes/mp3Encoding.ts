export type Mp3Channels = 1 | 2;

export type Mp3EncodingSettings = {
  channels: Mp3Channels;
  bitrate: string;
};

const FALLBACK_MIX_MP3_BITRATE = '128k';

function parseBitrate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+k$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

function resolveDefaultStereoBitrate(): string {
  const fromEnv = process.env.MIX_MP3_DEFAULT_BITRATE;
  const parsed = fromEnv ? parseBitrate(fromEnv) : null;
  return parsed ?? FALLBACK_MIX_MP3_BITRATE;
}

function resolveStereoBitrate(): string {
  const fromEnv = process.env.MIX_MP3_BITRATE;
  const parsed = fromEnv ? parseBitrate(fromEnv) : null;
  return parsed ?? resolveDefaultStereoBitrate();
}

function resolveChannels(): Mp3Channels {
  const raw = process.env.MIX_MP3_CHANNELS?.trim().toLowerCase();
  if (!raw) return 2;
  if (raw === '1' || raw === 'mono') return 1;
  if (raw === '2' || raw === 'stereo') return 2;
  return 2;
}

function resolveMonoBitrateOverride(): string | null {
  const fromEnv = process.env.MIX_MP3_MONO_BITRATE;
  return fromEnv ? parseBitrate(fromEnv) : null;
}

function isMonoSameBitrateAsStereo(): boolean {
  const v = process.env.MIX_MP3_MONO_SAME_BITRATE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function effectiveBitrateForChannels(stereoBitrate: string, channels: Mp3Channels): string {
  if (channels === 2) return stereoBitrate;

  const override = resolveMonoBitrateOverride();
  if (override) return override;
  if (isMonoSameBitrateAsStereo()) return stereoBitrate;

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

export function resolveMp3EncodingSettings(): Mp3EncodingSettings {
  const channels = resolveChannels();
  const stereoBitrate = resolveStereoBitrate();
  const bitrate = effectiveBitrateForChannels(stereoBitrate, channels);
  return { channels, bitrate };
}

