/**
 * Pins the per-arm search `statement_timeout` resolver.
 * The load-bearing claims: env beats config (incident escape hatch), the
 * default is unchanged at 8s so upgrades are a no-op, and every malformed
 * override falls through instead of hardening into a shorter budget — a bad
 * value must never break search, only fail to tune it.
 */
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SEARCH_ARM_TIMEOUT_MS,
  MIN_SEARCH_ARM_TIMEOUT_MS,
  MAX_SEARCH_ARM_TIMEOUT_MS,
  SEARCH_ARM_TIMEOUT_ENV_VAR,
  parseArmTimeoutMs,
  resolveArmTimeoutMsFromEnv,
  resolveArmTimeoutMs,
} from '../src/core/search/arm-timeout.ts';

const noEnv: NodeJS.ProcessEnv = {};
const withEnv = (v: string): NodeJS.ProcessEnv => ({ [SEARCH_ARM_TIMEOUT_ENV_VAR]: v });

describe('parseArmTimeoutMs', () => {
  test('accepts a plain millisecond integer', () => {
    expect(parseArmTimeoutMs('20000')).toBe(20_000);
    expect(parseArmTimeoutMs('  20000  ')).toBe(20_000);
  });

  test('accepts the exact bounds', () => {
    expect(parseArmTimeoutMs(String(MIN_SEARCH_ARM_TIMEOUT_MS))).toBe(MIN_SEARCH_ARM_TIMEOUT_MS);
    expect(parseArmTimeoutMs(String(MAX_SEARCH_ARM_TIMEOUT_MS))).toBe(MAX_SEARCH_ARM_TIMEOUT_MS);
  });

  test('rejects out-of-bounds values rather than clamping', () => {
    // Clamping would silently disagree with what the operator set.
    expect(parseArmTimeoutMs(String(MIN_SEARCH_ARM_TIMEOUT_MS - 1))).toBeNull();
    expect(parseArmTimeoutMs(String(MAX_SEARCH_ARM_TIMEOUT_MS + 1))).toBeNull();
    expect(parseArmTimeoutMs('0')).toBeNull();
  });

  test('rejects unit suffixes — the key is explicitly milliseconds', () => {
    // '20s' parsing as 20ms would be catastrophic: every arm would time out.
    expect(parseArmTimeoutMs('20s')).toBeNull();
    expect(parseArmTimeoutMs('8_000')).toBeNull();
    expect(parseArmTimeoutMs('1e4')).toBeNull();
    expect(parseArmTimeoutMs('-5000')).toBeNull();
    expect(parseArmTimeoutMs('2.5')).toBeNull();
  });

  test('rejects empty and nullish input', () => {
    expect(parseArmTimeoutMs('')).toBeNull();
    expect(parseArmTimeoutMs('   ')).toBeNull();
    expect(parseArmTimeoutMs(null)).toBeNull();
    expect(parseArmTimeoutMs(undefined)).toBeNull();
  });
});

describe('resolveArmTimeoutMs', () => {
  test('defaults to the previous hardcoded 8s when nothing is set', () => {
    expect(resolveArmTimeoutMs(null, noEnv)).toBe(DEFAULT_SEARCH_ARM_TIMEOUT_MS);
    expect(DEFAULT_SEARCH_ARM_TIMEOUT_MS).toBe(8_000);
  });

  test('uses the config value when there is no env override', () => {
    expect(resolveArmTimeoutMs('20000', noEnv)).toBe(20_000);
  });

  test('env beats config — the incident escape hatch', () => {
    expect(resolveArmTimeoutMs('20000', withEnv('45000'))).toBe(45_000);
  });

  test('falls through a malformed env to the config value', () => {
    expect(resolveArmTimeoutMs('20000', withEnv('nonsense'))).toBe(20_000);
  });

  test('falls through a malformed config to the default', () => {
    expect(resolveArmTimeoutMs('20s', noEnv)).toBe(DEFAULT_SEARCH_ARM_TIMEOUT_MS);
  });

  test('a malformed value on both tiers still yields a usable budget', () => {
    expect(resolveArmTimeoutMs('junk', withEnv('junk'))).toBe(DEFAULT_SEARCH_ARM_TIMEOUT_MS);
  });
});

describe('resolveArmTimeoutMsFromEnv', () => {
  test('returns null when unset so callers fall through', () => {
    expect(resolveArmTimeoutMsFromEnv(noEnv)).toBeNull();
  });

  test('reads a valid override', () => {
    expect(resolveArmTimeoutMsFromEnv(withEnv('30000'))).toBe(30_000);
  });

  test('returns null on a malformed override', () => {
    expect(resolveArmTimeoutMsFromEnv(withEnv('30s'))).toBeNull();
  });
});
