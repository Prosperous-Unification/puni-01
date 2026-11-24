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

/** One broken rule at one repository path, and what to do about it. */
export interface Finding {
  /** A stable `subject.rule` id. */
  readonly rule: string;
  /** Relative to the repository root. */
  readonly path: string;
  readonly message: string;
  /** What to do, in the imperative, naming the command when one exists. */
  readonly remedy: string;
}

/** The printed form of a finding: `<rule-id> <path>: <message>; fix: <remedy>`. */
export function formatFinding(finding: Finding): string {
  return `${finding.rule} ${finding.path}: ${finding.message}; fix: ${finding.remedy}`;
}

/** A defect kind and the remedy of its occurrences, written once beside the kind. */
export interface DefectRemedy {
  readonly kind: DefectKind;
  /** What to do about an occurrence whose details are `details`. */
  remedy(details: DefectDetails): string;
}

/** Pairs `kind` with the remedy its occurrences carry, read from their typed details. */
export function remedyDefect<Kind extends DefectKind>(
  kind: Kind,
  remedy: (details: InstanceType<Kind>['details']) => string,
): DefectRemedy {
  return { kind, remedy };
}

/**
 * The finding `caught` stands for when it is an occurrence of one of the kinds in `remedies`,
 * with that kind's remedy, else `undefined`.
 */
export function findDefect(
  caught: unknown,
  remedies: readonly DefectRemedy[],
): Finding | undefined {
  const known = remedies.find(({ kind }) => caught instanceof kind);
  if (known === undefined || !(caught instanceof known.kind)) return undefined;
  const { details } = caught;
  return {
    rule: details.rule,
    path: details.path,
    message: caught.message,
    remedy: known.remedy(details),
  };
}
