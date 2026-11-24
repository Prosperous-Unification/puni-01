import { defineException } from 'application-exception';

/** An invalid review request, task response, or attempt to file an unfinished review. */
export const ReviewRefused = defineException({
  tag: 'puni/burokrat-review/ReviewRefused',
  message: ({ reason }: { readonly reason: string }) => reason,
});

/** A journal or source snapshot that could not be read or updated. */
export const ReviewInputFailed = defineException({
  tag: 'puni/burokrat-review/ReviewInputFailed',
  message: ({ reason }: { readonly reason: string }) => reason,
});

/** Reports a refusal with a field or task-specific reason. */
export function refuseReview(reason: string): never {
  throw new ReviewRefused({ details: { reason } });
}
