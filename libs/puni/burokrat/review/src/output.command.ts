import type { Command, Io } from '@puni/shared-command';
import { CheckoutPathRefused, explainDefect } from '@puni/shared-checkout';
import { ReviewTemplateFailed } from '@puni/shared-records';
import type { ReviewTask } from './contract';
import { ReviewInputFailed, ReviewRefused } from './failures';

/** Prints a JSON task; a rejection or defective input is printed on stderr with its exit code. */
export function taskCommand<Request>(
  run: (cwd: string, request: Request) => ReviewTask,
): Command<Request> {
  return {
    run(request, io) {
      return reportReview(io, () => JSON.stringify(run(io.cwd, request)));
    },
  };
}

/** Prints the operation result on success, with exit 2 for refusal and 1 for input defects. */
export function reportReview(io: Io, operation: () => string): 0 | 1 | 2 {
  try {
    io.stdout(`${operation()}\n`);
    return 0;
  } catch (cause) {
    if (cause instanceof ReviewRefused) {
      io.stderr(`error: ${cause.message}\n`);
      return 2;
    }
    const reason =
      cause instanceof ReviewInputFailed ||
      cause instanceof ReviewTemplateFailed ||
      cause instanceof CheckoutPathRefused
        ? cause.message
        : explainDefect(cause);
    if (reason === undefined) throw cause;
    io.stderr(`error: ${reason}\n`);
    return 1;
  }
}
