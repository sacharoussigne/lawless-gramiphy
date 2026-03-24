export const MAX_MIX_DURATION_SECONDS = 35 * 60;

export const MIN_MIX_TRACK_COUNT = 2;

/** When true (env at build time), server + UI skip max mix duration checks. Temporary ops toggle. */
export function isMixDurationLimitDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_MIX_DISABLE_DURATION_LIMIT?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function getEffectiveMaxMixDurationSeconds(): number {
  return isMixDurationLimitDisabled() ? Number.MAX_SAFE_INTEGER : MAX_MIX_DURATION_SECONDS;
}
