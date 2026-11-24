import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, type ScratchDirectoryOwner, writeRepositoryFile } from '@puni/shared-testing';

/**
 * The system-state files `puni burokrat repo init` wrote at rules epoch 3, for the name `demo`
 * and owner `acme`, but for `AGENTS.md`, which ends in the `## Rules` section it copies from the
 * checkout puni runs from: no Markdown file declares a document type.
 */
export const epochThreeStateFiles: Readonly<Record<string, string>> = {
  'puni.json':
    '{"this-repo-type":"system-state","rules":3,"all-repos":[{"type":"system-state","remote":{"type":"github","url":"https://github.com/acme/demo"}},{"type":"system-records","remote":{"type":"github","url":"https://github.com/acme/demo-records"}}]}\n',
  '.gitignore': '.DS_Store\n.idea/\n',
  'README.md':
    '# demo\n\nThe system-state repository of demo, governed by `puni`. Agents start at\n`AGENTS.md`; `puni burokrat wiki map` prints the map from a task to the file to\nread first.\n',
};

/** The opening of the epoch-3 `AGENTS.md`, before the `## Rules` section it copies. */
export const epochThreeAgentsHead =
  '# demo\n\nThe system-state repository of demo: what demo is now, under the\nrules the `puni` CLI enforces.\n\n## Working here\n\n- The gate is `puni burokrat check`, run here, and\n  `puni burokrat check --repo system-records` for the records.\n- Unsure where something lives? `puni burokrat wiki map` prints the map\n  from a task to the file to read first.\n- Records live in <https://github.com/acme/demo-records>, cloned beside this repository as\n  `../demo-records`; its `AGENTS.md` says how to file one. File one when\n  the task asks, or when you decide something this repository and its commit\n  messages cannot carry. Read a record only when a task names it.\n\n';

/** The records files `repo init` wrote at rules epoch 3 beside {@link epochThreeStateFiles}. */
export const epochThreeRecordsFiles: Readonly<Record<string, string>> = {
  'AGENTS.md':
    '# demo-records\n\nRecords for `demo`: its past and its future. The system-state repository\nsays what the system is now; everything else is filed here. This repository is\nprivate.\n\n## Working here\n\n- `demo`, cloned beside this repository, is where work starts and where\n  `puni.json` lists both repositories. The gate for this one is\n  `puni burokrat check --repo system-records`, run from `../demo`.\n  Run it before you push.\n\n## Layout\n\nRecords are filed by kind. A directory appears with its first record; add\nno directory that is not named here.\n\n- `nav/`: what is intended or being weighed. `plans/`, `research/`.\n- `bur/`: what was decided, measured or retired. `adr/` holds decisions that\n  are hard to reverse, surprising, and had real alternatives, with the options\n  they rejected, `assessments/` holds measured results and run output worth\n  keeping, `findings/` holds scored code reviews, `assessment-reviews/` holds\n  reviews using a versioned assessment template, and `archive/` holds material\n  retired from `demo`.\n- `dash/`: what running development and operations needs now, in any\n  format.\n\n## Rules\n\n1. **One record per file.** In `nav/` and `bur/` a record is Markdown, named\n   `YYYY-MM-DD-short-title.md` by the UTC day it was written, and opens with\n   front matter. The gate names every field that is missing or wrong.\n2. **Records are not rewritten.** To change one, file a new record that names\n   the old one in `supersedes`, and add `superseded-by` to the old one. That\n   is the only edit a filed record takes. `dash/` is the exception: it is\n   kept current, and progress on a plan is tracked there, not in the plan.\n3. **Nothing flows back.** Record text is never copied into `demo`, its\n   commit messages, pull requests or issues. A decision reaches the system\n   as a statement of what it is now.\n4. **No secrets.** Credentials and keys stay out, private or not.\n5. **Find by file name.** Open only what the task needs.\n6. **Commit and push what you file.** Leave no uncommitted record behind.\n',
  '.gitignore': '.DS_Store\n.idea/\n',
};

/**
 * What the pair's owners added after `repo init`, as the puni of epoch 3 accepted it: a wiki page,
 * a guide for the people who use demo, and a record filed by that puni, none declaring a type.
 */
export const epochThreeAdded: {
  readonly state: Readonly<Record<string, string>>;
  readonly records: Readonly<Record<string, string>>;
} = {
  state: {
    'wiki/start.md':
      '---\ntitle: Start\nread-when: starting work on demo\n---\n\n# Start\n\nRead `AGENTS.md` first.\n',
    'docs/guide.md': '# Guide\n\nHow to use demo.\n',
  },
  records: {
    'nav/plans/2031-04-05-first-plan.md':
      '---\nkind: plan\ntitle: First plan\ndate: 2031-04-05\ncommit: abc1234\ntopics: start\nsummary: What demo does first.\n---\n\n# First plan\n',
  },
};

/**
 * A pair as `repo init` made it at rules epoch 3, with {@link epochThreeAdded}, each side
 * committed in its own git repository: `demo`, its `AGENTS.md` ending in `rules`, and
 * `demo-records` beside it, in a directory `scratchDirectories` creates and removes. Returns the
 * `demo` root.
 */
export function makeEpochThreePair(
  scratchDirectories: ScratchDirectoryOwner,
  rules: string,
): { readonly state: string; readonly records: string } {
  const parent = scratchDirectories.createDirectory('puni-epoch-three-');
  const state = join(parent, 'demo');
  const records = join(parent, 'demo-records');
  const files: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
    [state, { ...epochThreeStateFiles, ...epochThreeAdded.state }],
    [records, { ...epochThreeRecordsFiles, ...epochThreeAdded.records }],
  ];
  for (const [root, texts] of files) {
    for (const [path, text] of Object.entries(texts)) writeRepositoryFile(root, path, text);
  }
  writeRepositoryFile(state, 'AGENTS.md', `${epochThreeAgentsHead}${rules}`);
  for (const root of [state, records]) {
    symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
    runGit(root, ['init', '-q']);
    runGit(root, ['add', '-A']);
    runGit(root, [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'Start',
    ]);
  }
  return { state, records };
}
