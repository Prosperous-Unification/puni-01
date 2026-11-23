import { dirname, join, posix } from 'node:path';
import {
  CheckoutRootRefused,
  explainDefect,
  formatRegistry,
  githubUrlPattern,
  readRulesSection,
  renderIndex,
} from '@puni/shared-checkout';
import type { RepoInitRequest, RepositoryPairSetup, RepoRequirements } from './contract';
import { RemoteNameRefused, SourceRulesMissing } from './failures';
import { fillTemplate, newGitignore, templates } from './templates';

/** A GitHub repository name as `repo init` takes it: GitHub's characters, not starting with `.`. */
const namePattern = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;

/** A GitHub owner: letters, digits and hyphens. */
const ownerPattern = /^[A-Za-z0-9-]+$/u;

/**
 * The two remote URLs of the pair `name` under `owner`.
 *
 * @throws RemoteNameRefused when either is not a name GitHub and the registry accept.
 */
function nameRemotes(name: string, owner: string) {
  if (!ownerPattern.test(owner)) {
    throw new RemoteNameRefused({
      details: { option: '--owner', value: owner, form: 'letters, digits and hyphens' },
    });
  }
  const state = `https://github.com/${owner}/${name}`;
  const records = `${state}-records`;
  if (!namePattern.test(name) || !githubUrlPattern.test(state) || !githubUrlPattern.test(records)) {
    throw new RemoteNameRefused({
      details: {
        option: '--name',
        value: name,
        form: 'letters, digits, ".", "_" and "-", not starting with "." nor ending in ".git"',
      },
    });
  }
  return { state, records };
}

/**
 * The {@link RepositoryPairSetup}. The checkout `puni` runs from (the system-state repository of
 * the nearest `puni.json` above `programSource.directory`) gives the rules section, copied byte
 * for byte from its `AGENTS.md`, and the default owner, that of its own system-state remote.
 * `cwd` must be an empty directory but for `.git`, and `../<name>-records` must not exist; both
 * are judged before anything is written. The state side gets `puni.json` registering both
 * repositories, `AGENTS.md`, the `CLAUDE.md` link, `README.md`, `.gitignore` and the generated
 * `wiki/index/` of a repository with no projects and no pages; the records side `AGENTS.md`, the
 * `CLAUDE.md` link and `.gitignore`. Nothing runs git or reaches the network. A refused name or
 * owner, or a directory that is not where a new repository may go, is `refused`; a source
 * checkout that cannot be found or read, or whose `AGENTS.md` has no rules section, is
 * `defective`. Anything else propagates.
 */
export function createRepositoryPairSetup({
  checkoutRegistry,
  checkoutFiles,
  commandCatalog,
  programSource,
}: RepoRequirements): RepositoryPairSetup {
  const readSource = () => {
    const found = checkoutRegistry.locate(programSource.directory);
    const source = checkoutRegistry.resolve(found, 'system-state');
    const file = join(source.root, 'AGENTS.md');
    const rules = readRulesSection(
      checkoutFiles.open(source.root, source.type).readText('AGENTS.md'),
    );
    if (rules === undefined) throw new SourceRulesMissing({ details: { file } });
    const owner = posix.basename(posix.dirname(source.registry.repos['system-state'].remote.url));
    return { rules, owner };
  };
  const create = (cwd: string, request: RepoInitRequest) => {
    const source = readSource();
    const remotes = nameRemotes(request.name, request.owner ?? source.owner);
    const recordsRoot = join(dirname(cwd), `${request.name}-records`);
    const state = checkoutFiles.create(cwd, 'system-state', 'empty-directory');
    const records = checkoutFiles.create(recordsRoot, 'system-records', 'absent');
    const hasGit = checkoutFiles.open(cwd, 'system-state').exists('.git');
    const values = { name: request.name, recordsUrl: remotes.records };
    state.write(
      'puni.json',
      `${formatRegistry('system-state', { 'system-state': remotes.state, 'system-records': remotes.records })}\n`,
    );
    state.write('AGENTS.md', `${fillTemplate(templates.stateAgents, values)}\n${source.rules}`);
    state.link('CLAUDE.md', 'AGENTS.md');
    state.write('README.md', fillTemplate(templates.stateReadme, values));
    state.write('.gitignore', newGitignore);
    for (const [path, text] of renderIndex([], commandCatalog.list())) {
      state.write(path, text);
    }
    records.write('AGENTS.md', fillTemplate(templates.recordsAgents, values));
    records.link('CLAUDE.md', 'AGENTS.md');
    records.write('.gitignore', newGitignore);
    return {
      kind: 'created',
      state: { root: cwd, url: remotes.state, hasGit },
      records: { root: recordsRoot, url: remotes.records, hasGit: false },
    } as const;
  };
  return {
    init(cwd, request) {
      try {
        return create(cwd, request);
      } catch (caught) {
        if (caught instanceof RemoteNameRefused || caught instanceof CheckoutRootRefused) {
          return { kind: 'refused', reason: caught.message };
        }
        if (caught instanceof SourceRulesMissing) {
          return {
            kind: 'defective',
            reason: `${caught.message}; fix: run puni from a checkout whose AGENTS.md holds its rules`,
          };
        }
        const reason = explainDefect(caught);
        if (reason === undefined) throw caught;
        return { kind: 'defective', reason };
      }
    },
  };
}
