import { makeRedactionPolicy, type RedactionPolicy } from 'application-exception';

/** Property names whose values a failure report never holds, matched case-insensitively. */
export const sensitiveKeys = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apiKey',
  'credential',
] as const;

/**
 * Text a failure report never holds, wherever it appears: tokens by their shape (an `sk-` key,
 * a GitHub, Slack or AWS key, a bearer token) and the value of a `password`, `passwd`,
 * `token`, `secret`, `api_key` or `apikey` assignment by `=` or `:`.
 */
export const sensitiveText: readonly RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/gu,
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/gu,
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/gu,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\b(?:password|passwd|token|secret|api[_-]?key)\s*[=:]\s*\S+/giu,
];

/**
 * The redaction every failure report uses: the value of any {@link sensitiveKeys} key is left
 * out, and any {@link sensitiveText} is replaced.
 */
export function createFailureRedaction(): RedactionPolicy {
  return makeRedactionPolicy({
    keys: sensitiveKeys.map((key) => new RegExp(key, 'iu')),
    patterns: [...sensitiveText],
  });
}
