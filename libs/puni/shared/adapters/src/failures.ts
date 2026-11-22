import { defineException } from 'application-exception';

/** A child ended by a signal the runtime names but this platform gives no number. */
export const SignalUnknown = defineException({
  tag: 'puni/shared-adapters/SignalUnknown',
  message: ({ signalCode }: { signalCode: string }) =>
    `a child was ended by the signal ${signalCode}, which has no number here`,
});
