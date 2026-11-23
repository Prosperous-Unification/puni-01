import { type DefectRemedy, findDefect, type Finding } from '@puni/shared-failures';
import { checkoutDefects, FileUnreadable } from './failures';

/** The finding `caught` stands for when it is a defect of the checkout or of `remedies`. */
export function findCheckoutDefect(
  caught: unknown,
  remedies: readonly DefectRemedy[] = [],
): Finding | undefined {
  return findDefect(caught, [...checkoutDefects, ...remedies]);
}

/**
 * The one-line reason a feature reports a defective repository with, when `caught` stands for
 * one: a file that cannot be read gives its message, a defect of the checkout or of `remedies`
 * `<message>; fix: <remedy>`. Anything else is `undefined`, for the caller to rethrow.
 */
export function explainDefect(
  caught: unknown,
  remedies: readonly DefectRemedy[] = [],
): string | undefined {
  if (caught instanceof FileUnreadable) return caught.message;
  const defect = findCheckoutDefect(caught, remedies);
  return defect === undefined ? undefined : `${defect.message}; fix: ${defect.remedy}`;
}
