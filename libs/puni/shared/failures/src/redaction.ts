import { makeRedactionPolicy, type RedactionPolicy } from 'application-exception';
import { credentialShapes } from './credential-shapes';

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
 * Text a failure report never holds, wherever it appears: every one of the
 * {@link credentialShapes}, and the value of a `password`, `passwd`, `token`, `secret`, `api_key`
 * or `apikey` assignment by `=` or `:`, however short.
 */
export const sensitiveText: readonly RegExp[] = [
  ...credentialShapes.map(({ pattern }) => new RegExp(pattern.source, `${pattern.flags}g`)),
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
