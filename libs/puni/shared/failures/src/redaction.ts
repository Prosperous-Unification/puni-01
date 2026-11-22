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

/** The redaction every failure report uses: the value of any {@link sensitiveKeys} key is left out. */
export function createFailureRedaction(): RedactionPolicy {
  return makeRedactionPolicy({
    keys: sensitiveKeys.map((key) => new RegExp(key, 'iu')),
  });
}
