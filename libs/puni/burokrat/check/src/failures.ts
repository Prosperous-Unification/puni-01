import { defineException } from 'application-exception';

/** A scoping option given while judging a repository other than `system-state`: a refused command line. */
export const ProjectScopeRefused = defineException({
  tag: 'puni/burokrat-check/ProjectScopeRefused',
  message: ({ option, type }: { option: string; type: string }) =>
    `${option} needs the system-state repository; ${type} is judged whole`,
});

/** More than one of the options choosing what a check judges: a refused command line. */
export const ScopeOptionsConflict = defineException({
  tag: 'puni/burokrat-check/ScopeOptionsConflict',
  message: ({ options }: { options: readonly string[] }) =>
    `${options.join(' and ')} each choose what to judge; give at most one`,
});
