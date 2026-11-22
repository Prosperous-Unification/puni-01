/**
 * What every repository-defect kind carries in its details: the `check` rule the defect fails and
 * the repository-relative path it concerns. A defect is something wrong with a repository's own
 * inputs, such as a missing `puni.json`; it is reported as one finding, never as a stack trace.
 */
export interface DefectDetails {
  readonly rule: string;
  readonly path: string;
}

/** A failure kind whose occurrences are repository defects. */
export type DefectKind = abstract new (
  ...input: never[]
) => Error & { readonly details: DefectDetails };

/** One broken rule at one repository path. */
export interface Finding {
  /** A stable `subject.rule` id. */
  readonly rule: string;
  /** Relative to the repository root. */
  readonly path: string;
  readonly message: string;
}

/** The finding `caught` stands for when it is an occurrence of one of `kinds`, else `undefined`. */
export function findDefect(caught: unknown, kinds: readonly DefectKind[]): Finding | undefined {
  const kind = kinds.find((candidate) => caught instanceof candidate);
  if (kind === undefined || !(caught instanceof kind)) return undefined;
  return { rule: caught.details.rule, path: caught.details.path, message: caught.message };
}
