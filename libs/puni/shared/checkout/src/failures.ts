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

/**
 * A `puni.json` pinning a rules epoch later than the latest this `puni` knows: a refusal, since
 * the rules that epoch holds are not here to judge by.
 */
export const RulesPinAhead = defineException({
  tag: 'puni/shared-checkout/RulesPinAhead',
  message: ({ pin, latest, version }: { pin: number; latest: number; version: string }) =>
    `puni.json pins rules epoch ${String(pin)}, but puni ${version} knows rules only up to epoch ${String(latest)}; upgrade puni`,
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

/** Git cannot list the files of a checkout; `reason` is git's. */
export const CheckoutUnlistable = defineException({
  tag: 'puni/shared-checkout/CheckoutUnlistable',
  message: ({ reason }: { rule: 'repository.git'; path: '.'; reason: string }) => reason,
});

/** Git cannot list the commits of a range; `reason` is git's. */
export const CommitsUnlistable = defineException({
  tag: 'puni/shared-checkout/CommitsUnlistable',
  message: ({
    range,
    reason,
  }: {
    rule: 'repository.git';
    path: '.';
    range: string;
    reason: string;
  }) => `the commits of ${range} cannot be listed: ${reason}`,
});

/** Git gives no `HEAD` commit for a checkout, as in a repository with no commit; `reason` is git's. */
export const HeadCommitUnreadable = defineException({
  tag: 'puni/shared-checkout/HeadCommitUnreadable',
  message: ({
    root,
    reason,
  }: {
    rule: 'repository.git';
    path: '.';
    root: string;
    reason: string;
  }) => `the HEAD commit of ${root} cannot be read: ${reason}`,
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

/** The repository defects this library raises and their remedies; a feature reports each as one finding. */
export const checkoutDefects = [
  remedyDefect(
    RegistryMissing,
    () => 'run puni from the system-state repository or a directory in it',
  ),
  remedyDefect(
    RegistryInvalid,
    () =>
      'correct puni.json as the message says: this-repo-type, rules (the rules epoch), all-repos listing every type once, and optionally map (each partition path to its purpose) and keys starting x-',
  ),
  remedyDefect(CheckoutMissing, ({ url, root }) => `clone it: git clone ${url} ${root}`),
  remedyDefect(
    CheckoutUnlistable,
    () =>
      'make `git ls-files` succeed in the repository: resolve what git reports, such as unmerged entries, then rerun',
  ),
  remedyDefect(
    CommitsUnlistable,
    ({ range }) => `make \`git log ${range}\` succeed in the repository, then rerun`,
  ),
  remedyDefect(
    HeadCommitUnreadable,
    ({ root }) => `commit in ${root} so that HEAD names a commit, then rerun`,
  ),
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
 * A path a checkout refuses: absolute, leaving the root, or written where the checkout writes nothing.
 * Only a defect in the code that asked raises it.
 */
export const CheckoutPathRefused = defineException({
  tag: 'puni/shared-checkout/CheckoutPathRefused',
  message: ({ path, reason }: { path: string; reason: string }) => `${path}: ${reason}`,
});

/**
 * A directory a new repository may not be created in: one that is not empty but for `.git`, or
 * one that must not exist and does. A refused command line.
 */
export const CheckoutRootRefused = defineException({
  tag: 'puni/shared-checkout/CheckoutRootRefused',
  message: ({ root, reason }: { root: string; reason: string }) => `${root} ${reason}`,
});

/** An end of a commit range naming no commit of the repository: a refused command line. */
export const RevisionUnknown = defineException({
  tag: 'puni/shared-checkout/RevisionUnknown',
  message: ({ revision }: { revision: string }) =>
    `${revision} names no commit of the repository; fetch it, or name a commit that exists`,
});

/** A staged file whose text git does not give, though it listed the file as staged. */
export const StagedTextUnreadable = defineException({
  tag: 'puni/shared-checkout/StagedTextUnreadable',
  message: ({ path, reason }: { path: string; reason: string }) =>
    `the staged text of ${path} cannot be read: ${reason}`,
});

/**
 * A file the code needs that exists but cannot be read, such as one without read permission or a
 * directory where a file belongs. `path` is as the caller named it; `cause` is the runtime's error.
 */
export const FileUnreadable = defineException({
  tag: 'puni/shared-checkout/FileUnreadable',
  message: ({ path, reason }: { path: string; reason: string }) => `cannot read ${path}: ${reason}`,
});

/**
 * A source file's text that its reader cannot read, as one nested past what its parser can
 * follow: a fault of the file, which `reason` names.
 */
export const SourceUnreadable = defineException({
  tag: 'puni/shared-checkout/SourceUnreadable',
  message: ({ reason }: { reason: string }) => reason,
});

/**
 * A source reader that cannot read any file, as one whose compiler or library types are not
 * installed or not what it expects: a defect of puni's installation, never of the file read.
 */
export const SourceReaderBroken = defineException({
  tag: 'puni/shared-checkout/SourceReaderBroken',
  message: ({ reader, problem }: { reader: string; problem: string }) =>
    `the ${reader} source reader cannot read: ${problem}; reinstall puni with its dependencies`,
});

/**
 * Two composed source readers claiming one file extension, so no one reader reads its files: a
 * defect of the composition.
 */
export const SourceReadersOverlap = defineException({
  tag: 'puni/shared-checkout/SourceReadersOverlap',
  message: ({ extension }: { extension: string }) =>
    `two source readers read ${extension}; compose one reader per extension`,
});
