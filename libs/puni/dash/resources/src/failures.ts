import { defineException } from 'application-exception';

/** A resource name that is not lower-case letters and digits joined by single hyphens. */
export const ResourceNameRefused = defineException({
  tag: 'puni/dash-resources/ResourceNameRefused',
  message: ({ name }: { name: string }) =>
    `resource name ${JSON.stringify(name)} is refused; expected lower-case letters and digits joined by single hyphens`,
});

/** A resource name whose worktree path or branch is taken. */
export const ResourceExists = defineException({
  tag: 'puni/dash-resources/ResourceExists',
  message: ({ name, taken }: { name: string; taken: string }) =>
    `resource ${name} cannot be created: ${taken}; choose another name or remove it first`,
});

/** A name no resource has. */
export const ResourceUnknown = defineException({
  tag: 'puni/dash-resources/ResourceUnknown',
  message: ({ name, known }: { name: string; known: readonly string[] }) =>
    known.length === 0
      ? `no resource named ${name}; there are no resources`
      : `no resource named ${name}; the resources are ${known.join(', ')}`,
});

/** A resource whose removal would lose work, and every reason why. */
export const ResourceNotDisposable = defineException({
  tag: 'puni/dash-resources/ResourceNotDisposable',
  message: ({ name, reasons }: { name: string; reasons: readonly string[] }) =>
    `resource ${name} is not removed: ${reasons.join(', and ')}; keep that work first, or pass --force to discard it`,
});

/** Git could not do what a resource needs. */
export const ResourceGitFailed = defineException({
  tag: 'puni/dash-resources/ResourceGitFailed',
  message: ({ doing, reason }: { doing: string; reason: string }) =>
    `git could not ${doing}: ${reason}`,
});
