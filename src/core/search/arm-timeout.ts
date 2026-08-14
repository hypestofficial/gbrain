/**
 * Per-arm `statement_timeout` for the hybrid-search recall arms.
 *
 * Each recall arm (keyword, title, vector, relational) runs inside a scoped
 * read transaction that sets a SHORT `SET LOCAL statement_timeout` so one slow
 * arm can't hold a pooled connection for the pooler's full 2-minute budget.
 * The arms fail open: a timed-out arm is dropped and the remaining arms still
 * produce results.
 *
 * That budget was a hardcoded `'8s'`. On a large brain the chunk-keyword arm
 * sits right on that line — a broad term ("healify" on a 60k-chunk brain)
 * matches ~10k chunks and needs ~37k buffer reads to rank them, measured at
 * 0.5-7.5s depending on cache warmth. The arm then fails ~2 runs in 3, which
 * surfaces as an `internal_error` over MCP and as silently-degraded recall on
 * the CLI (fewer results than `-k` asked for, because an arm went missing).
 *
 * The fix is not a bigger magic number — it's making the budget tunable per
 * brain, since the right value scales with corpus size and pooler latency.
 *
 * Resolution order mirrors `pace-mode.ts` (env ABOVE config, so an operator
 * can widen the budget mid-incident without a DB write):
 *
 *     GBRAIN_SEARCH_ARM_TIMEOUT_MS  →  config `search.arm_timeout_ms`  →  8000
 */

/** Hardcoded budget this replaces. Unchanged so upgrades are a no-op. */
export const DEFAULT_SEARCH_ARM_TIMEOUT_MS = 8_000;

/**
 * Bounds. The floor keeps a typo (`5`) from disabling every recall arm; the
 * ceiling keeps the per-arm budget under the Supabase pooler's own 2-minute
 * `statement_timeout`, past which the pooler cancels first and the arm-level
 * value stops meaning anything.
 */
export const MIN_SEARCH_ARM_TIMEOUT_MS = 1_000;
export const MAX_SEARCH_ARM_TIMEOUT_MS = 120_000;

/** The config key operators set: `gbrain config set search.arm_timeout_ms 20000`. */
export const SEARCH_ARM_TIMEOUT_CONFIG_KEY = 'search.arm_timeout_ms';

/** The env override, checked before config. */
export const SEARCH_ARM_TIMEOUT_ENV_VAR = 'GBRAIN_SEARCH_ARM_TIMEOUT_MS';

/**
 * Parse + bounds-check one candidate. Returns null for anything unusable so
 * the caller falls through to the next tier rather than adopting a bad value.
 *
 * Fail-open by design: a malformed override must never harden into a shorter
 * budget than the default, because that would break search instead of tuning it.
 */
export function parseArmTimeoutMs(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  // Reject '20s', '8_000', '1e4' etc. The key is explicitly milliseconds;
  // silently coercing a unit-suffixed value would be a footgun.
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_SEARCH_ARM_TIMEOUT_MS) return null;
  if (parsed > MAX_SEARCH_ARM_TIMEOUT_MS) return null;
  return parsed;
}

/**
 * Env tier only — synchronous, so a caller already holding a transaction can
 * short-circuit without a config round-trip.
 */
export function resolveArmTimeoutMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  return parseArmTimeoutMs(env[SEARCH_ARM_TIMEOUT_ENV_VAR]);
}

/**
 * Full resolution given an already-fetched config value. Kept pure (no I/O) so
 * the engine owns caching and this stays trivially testable.
 */
export function resolveArmTimeoutMs(
  configValue?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): number {
  return (
    resolveArmTimeoutMsFromEnv(env) ??
    parseArmTimeoutMs(configValue) ??
    DEFAULT_SEARCH_ARM_TIMEOUT_MS
  );
}
