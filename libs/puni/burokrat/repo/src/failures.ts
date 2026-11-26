import { defineException } from 'application-exception';

/** A `--name` or `--owner` that names no GitHub repository or owner: a refused command line. */
export const RemoteNameRefused = defineException({
  tag: 'puni/burokrat-repo/RemoteNameRefused',
  message: ({ option, value, form }: { option: string; value: string; form: string }) =>
    `${option} ${JSON.stringify(value)} is refused; expected ${form}`,
});

/** The `AGENTS.md` of the checkout puni runs from holds no `## Rules` section to copy. */
export const SourceRulesMissing = defineException({
  tag: 'puni/burokrat-repo/SourceRulesMissing',
  message: ({ file }: { file: string }) => `${file} has no ## Rules section to copy`,
});

/** A template placeholder with no value: a defect of this library's templates. */
export const TemplatePlaceholderUnfilled = defineException({
  tag: 'puni/burokrat-repo/TemplatePlaceholderUnfilled',
  message: ({ placeholder }: { placeholder: string }) =>
    `the template placeholder {{${placeholder}}} has no value`,
});

/** A system-state `AGENTS.md` with no `## Rules` section for `repo upgrade` to rewrite. */
export const RulesSectionMissing = defineException({
  tag: 'puni/burokrat-repo/RulesSectionMissing',
  message: ({ file }: { file: string }) => `${file} has no ## Rules section to rewrite`,
});

/**
 * The checkout `puni` runs from holds a rules section other than that of the epoch being written:
 * the rules of an older epoch, which a new or upgraded repository must not take.
 */
export const SourceRulesStale = defineException({
  tag: 'puni/burokrat-repo/SourceRulesStale',
  message: ({ file, epoch }: { file: string; epoch: number }) =>
    `the checkout puni runs from holds the rules of an older epoch than ${String(epoch)} in ${file}; run puni from a checkout that holds the rules of epoch ${String(epoch)}`,
});
