import { defineException } from 'application-exception';

/**
 * A refused command line: unknown group, unexpected token or unknown flag. Its message is the
 * one-line reason, printed after `error: ` with exit code 2.
 */
export const UsageRefused = defineException({
  tag: 'puni/shared-command/UsageRefused',
  message: ({ reason }: { reason: string }) => reason,
});

/**
 * A command tree that cannot be read: `path` has no doc page, or a command there has no brief.
 * Only a defect in how the CLI is composed raises it.
 */
export const CommandTreeInvalid = defineException({
  tag: 'puni/shared-command/CommandTreeInvalid',
  message: ({ path, problem }: { path: string; problem: string }) => `${path} ${problem}`,
});

/** Optique parsed `<path...> --help` as a command instead of printing help: a defect in the parser. */
export const HelpNotPrinted = defineException({
  tag: 'puni/shared-command/HelpNotPrinted',
  message: ({ path }: { path: string }) => `${path} --help did not print help`,
});
