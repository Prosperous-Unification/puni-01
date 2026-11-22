import { remedyDefect } from '@puni/shared-failures';
import { defineException } from 'application-exception';

/** No `puni.json` at or above the directory a command started from. */
export const RegistryMissing = defineException({
  tag: 'puni/shared-checkout/RegistryMissing',
  message: ({ cwd }: { rule: 'repository.root'; path: '.'; cwd: string }) =>
    `no puni.json in ${cwd} or any directory above it; run puni from the system-state repository, which holds puni.json`,
});

/** A `puni.json` that is not the registry it must be; `file` is its absolute path. */
export const RegistryInvalid = defineException({
  tag: 'puni/shared-checkout/RegistryInvalid',
  message: ({
    file,
    problem,
  }: {
    rule: 'repository.config';
    path: 'puni.json';
    file: string;
    problem: string;
  }) => `${file} ${problem}`,
});

/** A registered repository that is not checked out beside the one holding `puni.json`. */
export const CheckoutMissing = defineException({
  tag: 'puni/shared-checkout/CheckoutMissing',
  message: ({
    type,
    root,
    url,
  }: {
    rule: 'repository.checkout';
    path: '.';
    type: string;
    root: string;
    url: string;
  }) => `the ${type} repository is not checked out at ${root}; clone ${url} there`,
});

/** The projects of a checkout cannot be listed; `reason` is git's. */
export const ProjectsUnlistable = defineException({
  tag: 'puni/shared-checkout/ProjectsUnlistable',
  message: ({ reason }: { rule: 'repository.projects'; path: '.'; reason: string }) => reason,
});

/** Two `project.json` files name the same project. */
export const ProjectNameShared = defineException({
  tag: 'puni/shared-checkout/ProjectNameShared',
  message: ({
    name,
    first,
    second,
  }: {
    rule: 'repository.projects';
    path: string;
    name: string;
    first: string;
    second: string;
  }) => `project ${name} is named by both ${first}/project.json and ${second}/project.json`,
});

/** A project scope was asked for in a checkout without a root `project.json`. */
export const RootProjectMissing = defineException<
  'puni/shared-checkout/RootProjectMissing',
  { rule: 'repository.projects'; path: 'project.json' }
>({
  tag: 'puni/shared-checkout/RootProjectMissing',
  message: () =>
    'is missing: --project needs a root project that owns every file no other project owns',
});

/** What to do when git cannot list a checkout, whichever check asked. */
export const gitListingRemedy =
  'make `git ls-files` succeed in the repository: resolve what git reports, such as unmerged entries, then rerun';

/** The repository defects this library raises and their remedies; a feature reports each as one finding. */
export const checkoutDefects = [
  remedyDefect(
    RegistryMissing,
    () => 'run puni from the system-state repository or a directory in it',
  ),
  remedyDefect(
    RegistryInvalid,
    () =>
      'correct puni.json as the message says: this-repo-type, and all-repos listing every type once',
  ),
  remedyDefect(CheckoutMissing, ({ url, root }) => `clone it: git clone ${url} ${root}`),
  remedyDefect(ProjectsUnlistable, () => gitListingRemedy),
  remedyDefect(
    ProjectNameShared,
    ({ second }) => `rename the project in ${second}/project.json; every project name is unique`,
  ),
  remedyDefect(RootProjectMissing, () => 'add a project.json at the root naming the root project'),
] as const;

/** A `--project` naming no project of the checkout: a refused command line. */
export const ProjectUnknown = defineException({
  tag: 'puni/shared-checkout/ProjectUnknown',
  message: ({ name, known }: { name: string; known: string }) =>
    `no project named ${name}; the projects are ${known}`,
});

/**
 * A path a checkout refuses: absolute, leaving the root, or written outside the generated index.
 * Only a defect in the code that asked raises it.
 */
export const CheckoutPathRefused = defineException({
  tag: 'puni/shared-checkout/CheckoutPathRefused',
  message: ({ path, reason }: { path: string; reason: string }) => `${path}: ${reason}`,
});

/** A staged file whose text git does not give, though it listed the file as staged. */
export const StagedTextUnreadable = defineException({
  tag: 'puni/shared-checkout/StagedTextUnreadable',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `the staged text of ${path} cannot be read: ${reason}`,
});
