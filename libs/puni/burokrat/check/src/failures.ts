import { defineException } from 'application-exception';

/** `--project` given while judging a repository other than `system-state`: a refused command line. */
export const ProjectScopeRefused = defineException({
  tag: 'puni/burokrat-check/ProjectScopeRefused',
  message: ({ type }: { type: string }) =>
    `--project needs the system-state repository; ${type} is judged whole`,
});
