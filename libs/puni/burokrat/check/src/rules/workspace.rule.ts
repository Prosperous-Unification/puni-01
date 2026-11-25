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
  since: 1,
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

/** The gate scripts of the root `package.json`: the whole gate, and the gate of what a change affects. */
const gateScripts = ['gate', 'gate:affected'] as const;

/**
 * Whether `text` runs the package script `script`, a name of word characters, `:` and `-`, and not
 * one whose name only starts with it.
 */
function runsScript(text: string, script: string): boolean {
  return new RegExp(`\\bbun run ${script}(?![\\w:-])`, 'u').test(text);
}

/**
 * The parts `script` is made of when the root `package.json` gives it as `bun run <part>` steps
 * joined by `&&`, which CI may run as separate jobs; none for any other script, or none at all.
 */
function readGateParts(files: CheckoutFiles, script: string): readonly string[] {
  if (!files.exists('package.json')) return [];
  const read = parseJson(files.readText('package.json'));
  if ('problem' in read) return [];
  const scripts = isRecord(read.value) ? read.value['scripts'] : undefined;
  const body = isRecord(scripts) ? scripts[script] : undefined;
  if (typeof body !== 'string') return [];
  const parts = body.split('&&').map((step) => /^\s*bun run ([\w:-]+)\s*$/u.exec(step)?.[1]);
  return parts.every((part): part is string => part !== undefined) ? parts : [];
}

/**
 * Whether the repository is an Nx workspace, which holds code and its gate scripts: it has an
 * `nx.json`. A system-state repository without one holds no code, so the rules of the workspace
 * and its gate do not apply to it.
 */
function isWorkspace(files: CheckoutFiles): boolean {
  return files.exists('nx.json');
}

/**
 * The CI workflow of an Nx workspace ({@link isWorkspace}) runs both gate scripts, `bun run gate`
 * and `bun run gate:affected`: each whole, or every part it is made of ({@link readGateParts}), so
 * that CI may run the parts as parallel jobs. A repository without `nx.json` has no gate scripts
 * to run.
 */
export const requireCiGate: Rule = {
  id: 'ci.gate',
  since: 1,
  remedy: `run \`bun run gate\` on pushes and \`bun run gate:affected\` on pull requests in ${workflow}, each whole or every \`bun run\` part of it`,
  judge({ files }) {
    if (!isWorkspace(files)) return [];
    if (!files.exists(workflow)) return [{ path: workflow, message: 'is missing' }];
    const text = files.readText(workflow);
    return gateScripts.flatMap((script) => {
      if (runsScript(text, script)) return [];
      const parts = readGateParts(files, script);
      const missing = parts.filter((part) => !runsScript(text, part));
      if (parts.length > 0 && missing.length === 0) return [];
      const message =
        missing.length < parts.length
          ? `does not run bun run ${script}, nor its parts ${missing.map((part) => `bun run ${part}`).join(', ')}`
          : `does not run bun run ${script}`;
      return [{ path: workflow, message }];
    });
  },
};
