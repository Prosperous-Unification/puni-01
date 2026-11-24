import { defineException } from 'application-exception';

/** A child ended by a signal the runtime names but this platform gives no number. */
export const SignalUnknown = defineException({
  tag: 'puni/shared-adapters/SignalUnknown',
  message: ({ signalCode }: { signalCode: string }) =>
    `a child was ended by the signal ${signalCode}, which has no number here`,
});

/**
 * A relative path given to a file system method that changes the file system: it would resolve
 * against the process's working directory, which may be a source tree.
 */
export const PathNotAbsolute = defineException({
  tag: 'puni/shared-adapters/PathNotAbsolute',
  message: ({ path }: { path: string }) =>
    `${path} is not an absolute path; the file system changes only absolute paths`,
});
