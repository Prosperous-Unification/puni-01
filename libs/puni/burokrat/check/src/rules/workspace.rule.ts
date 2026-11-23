import { type CheckoutFiles, isRecord, nameRepository, parseJson } from '@puni/shared-checkout';
import type { Breach, Rule } from '../finding';
import { listInlineCode } from '../docs';

/**
 * `AGENTS.md` gives the records repository as the registry does: the `system-records` remote URL,
 * and `../<name>` for its checkout, `<name>` being that URL's last segment. A missing `AGENTS.md`
 * is `agents.exists`'s.
 */
export const matchRecordsLocation: Rule = {
  id: 'agents.records',
  remedy:
    'give the records repository in AGENTS.md as puni.json registers it: its system-records URL, and `../<name>` for its checkout',
  judge({ files, registry }) {
    const path = 'AGENTS.md';
    if (!files.exists(path)) return [];
    const text = files.readText(path);
    const records = registry.repos['system-records'];
    const { url } = records.remote;
    const sibling = `../${nameRepository(records)}`;
    const remedy = `write the records repository as ${url}, checked out as \`${sibling}\``;
    const breaches: Breach[] = [];
    if (!text.includes(url)) {
      breaches.push({ path, message: `does not give the records repository URL ${url}`, remedy });
    }
    const siblings = listInlineCode(text).filter((span) => /^\.\.\/[^/\s]+$/u.test(span));
    if (siblings.length === 0) {
      breaches.push({ path, message: `does not give the records checkout ${sibling}`, remedy });
    }
    for (const given of siblings.filter((span) => span !== sibling)) {
      breaches.push({
        path,
        message: `gives the records checkout ${given}, not ${sibling}`,
        remedy,
      });
    }
    return breaches;
  },
};

const workflow = '.github/workflows/ci.yml';

const gateRuns: readonly (readonly [string, RegExp])[] = [
  ['bun run gate', /\bbun run gate(?![\w:-])/u],
  ['bun run gate:affected', /\bbun run gate:affected(?![\w:-])/u],
];

/**
 * Whether the repository is an Nx workspace, which holds code and its gate scripts: it has an
 * `nx.json`. A system-state repository without one holds no code, so the rules of the workspace
 * and its gate do not apply to it.
 */
function isWorkspace(files: CheckoutFiles): boolean {
  return files.exists('nx.json');
}

/**
 * The CI workflow of an Nx workspace ({@link isWorkspace}) runs both gate scripts: `bun run gate`
 * and `bun run gate:affected`. A repository without `nx.json` has no gate scripts to run.
 */
export const requireCiGate: Rule = {
  id: 'ci.gate',
  remedy: `run \`bun run gate\` on pushes and \`bun run gate:affected\` on pull requests in ${workflow}`,
  judge({ files }) {
    if (!isWorkspace(files)) return [];
    if (!files.exists(workflow)) return [{ path: workflow, message: 'is missing' }];
    const text = files.readText(workflow);
    return gateRuns
      .filter(([, pattern]) => !pattern.test(text))
      .map(([script]) => ({ path: workflow, message: `does not run ${script}` }));
  },
};

/** The Nx sync generator that keeps `wiki/index/` current. */
const indexSyncGenerator = '@puni/nx-sync:wiki-index';

/**
 * The `nx.json` of an Nx workspace ({@link isWorkspace}) registers {@link indexSyncGenerator} in
 * `sync.globalGenerators`, so `nx sync:check` judges the index. Nx suggests removing a failing
 * global generator; this rule undoes that. A repository without `nx.json` keeps its index current
 * through `index.current` alone.
 */
export const requireIndexSync: Rule = {
  id: 'nx.sync',
  remedy: `restore "sync": { "globalGenerators": ["${indexSyncGenerator}"] } in nx.json; if the generator fails, fix the finding it prints instead`,
  judge({ files }) {
    const path = 'nx.json';
    if (!isWorkspace(files)) return [];
    const read = parseJson(files.readText(path));
    if ('problem' in read) return [{ path, message: read.problem }];
    const sync = isRecord(read.value) ? read.value['sync'] : undefined;
    const generators = isRecord(sync) ? sync['globalGenerators'] : undefined;
    if (Array.isArray(generators) && generators.includes(indexSyncGenerator)) return [];
    return [{ path, message: `does not list ${indexSyncGenerator} in sync.globalGenerators` }];
  },
};
