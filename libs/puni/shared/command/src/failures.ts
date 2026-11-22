import { defineException } from 'application-exception';

/**
 * A refused command line: unknown group, unexpected token or unknown flag. Its message is the
 * one-line reason, printed after `error: ` with exit code 2.
 */
export const UsageRefused = defineException({
  tag: 'puni/shared-command/UsageRefused',
  message: ({ reason }: { reason: string }) => reason,
});
