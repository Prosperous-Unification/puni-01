import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const root = new URL('../../../../', import.meta.url).pathname;

/** The repository's ESLint configuration, without the type-checked rules a virtual file cannot feed. */
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
});

const restricted = ['no-restricted-imports', 'no-restricted-globals', 'no-restricted-syntax'];

async function lintRestrictions(path: string, source: string): Promise<string[]> {
  const [report] = await eslint.lintText(`${source}\n`, { filePath: join(root, path) });
  return (report?.messages ?? [])
    .map((entry) => entry.ruleId ?? `fatal: ${entry.message}`)
    .filter((rule) => restricted.includes(rule) || rule.startsWith('fatal'));
}

const check = 'libs/puni/burokrat/check/src';

const refused: readonly (readonly [string, string, string, string])[] = [
  [
    'a feature importing a repository',
    `${check}/x.feature.ts`,
    "import { a } from './y.repository';",
    'no-restricted-imports',
  ],
  [
    'a feature importing the adapters',
    `${check}/x.feature.ts`,
    "import { a } from '@puni/shared-adapters';",
    'no-restricted-imports',
  ],
  [
    'a feature importing the ports',
    `${check}/x.feature.ts`,
    "import type { A } from '@puni/shared-ports';",
    'no-restricted-imports',
  ],
  [
    'a command importing a resource',
    `${check}/x.command.ts`,
    "import { a } from './y.resource';",
    'no-restricted-imports',
  ],
  [
    'a command importing a feature',
    `${check}/x.command.ts`,
    "import { a } from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'a rule importing a feature',
    `${check}/rules/x.rule.ts`,
    "import { a } from '../y.feature';",
    'no-restricted-imports',
  ],
  [
    'a rule importing the ports',
    `${check}/rules/x.rule.ts`,
    "import type { A } from '@puni/shared-ports';",
    'no-restricted-imports',
  ],
  [
    'a resource importing a feature',
    `${check}/x.resource.ts`,
    "import { a } from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'a resource reaching node:fs',
    `${check}/x.resource.ts`,
    "import { a } from 'node:fs';",
    'no-restricted-imports',
  ],
  [
    'a repository importing a resource',
    `${check}/x.repository.ts`,
    "import { a } from './y.resource';",
    'no-restricted-imports',
  ],
  [
    'a port importing a resource',
    `${check}/x.port.ts`,
    "import type { A } from './y.resource';",
    'no-restricted-imports',
  ],
  [
    'domain importing a rule',
    `${check}/x.ts`,
    "import { a } from './y.rule';",
    'no-restricted-imports',
  ],
  [
    'domain reaching node:fs',
    `${check}/x.ts`,
    "import { a } from 'node:fs';",
    'no-restricted-imports',
  ],
  ['domain reaching bun', `${check}/x.ts`, "import { a } from 'bun';", 'no-restricted-imports'],
  [
    'domain using process',
    `${check}/x.ts`,
    'export const a = process.cwd();',
    'no-restricted-globals',
  ],
  [
    'a feature using Bun',
    `${check}/x.feature.ts`,
    'export const a = Bun.version;',
    'no-restricted-globals',
  ],
  [
    'a rule using fetch',
    `${check}/x.rule.ts`,
    "export const a = fetch('x');",
    'no-restricted-globals',
  ],
  [
    'module.ts importing the ports',
    `${check}/module.ts`,
    "import type { A } from '@puni/shared-ports';",
    'no-restricted-imports',
  ],
  [
    'a dynamic import in a library',
    `${check}/x.ts`,
    "export const a = import('./y');",
    'no-restricted-syntax',
  ],
  [
    'a dynamic import in a test',
    `${check}/x.test.ts`,
    "export const a = import('./y');",
    'no-restricted-syntax',
  ],
  [
    'a dynamic import in the app outside the entrypoint',
    'apps/puni/cli/src/main.ts',
    "export const a = import('./y');",
    'no-restricted-syntax',
  ],
  [
    'an import of another library’s files',
    `${check}/x.ts`,
    "import { a } from '../../wiki/src/y';",
    'no-restricted-imports',
  ],
  [
    'an alias import of another library’s files',
    'apps/puni/cli/src/main.ts',
    "import { a } from '@puni/burokrat-check/src/y';",
    'no-restricted-imports',
  ],
  [
    'an index re-exporting a resource',
    'libs/puni/shared/checkout/src/index.ts',
    "export { a } from './y.resource';",
    'no-restricted-syntax',
  ],
  [
    'an index re-exporting a feature',
    `${check}/index.ts`,
    "export * from './y.feature';",
    'no-restricted-syntax',
  ],
  [
    'an index re-exporting a rule',
    `${check}/index.ts`,
    "export { a } from './y.rule';",
    'no-restricted-syntax',
  ],
  [
    'an index re-exporting a repository',
    `${check}/index.ts`,
    "export { a } from './y.repository';",
    'no-restricted-syntax',
  ],
];

const allowed: readonly (readonly [string, string, string])[] = [
  ['domain importing node:path', `${check}/x.ts`, "import { a } from 'node:path';"],
  [
    'a feature importing a rule, domain and a library',
    `${check}/x.feature.ts`,
    "import { a } from './y.rule';\nimport { b } from './z';\nimport { c } from '@puni/shared-checkout';",
  ],
  [
    'a resource importing the ports',
    `${check}/x.resource.ts`,
    "import type { A } from '@puni/shared-ports';",
  ],
  [
    'contract.ts importing the ports',
    `${check}/contract.ts`,
    "import type { A } from '@puni/shared-ports';",
  ],
  [
    'a repository reaching the runtime',
    'libs/puni/shared/adapters/src/x.repository.ts',
    "import { a } from 'node:fs';\nexport const b = Bun.version;",
  ],
  [
    'the entrypoint importing dynamically',
    'apps/puni/cli/src/entrypoint.ts',
    "export const a = import('./main');",
  ],
  [
    'the app reaching the runtime and the adapters',
    'apps/puni/cli/src/main.ts',
    "import { a } from 'node:fs';\nimport { b } from '@puni/shared-adapters';\nexport const c = process.cwd();",
  ],
  [
    'a test reaching the runtime and the testing library',
    `${check}/x.test.ts`,
    "import { a } from 'node:fs';\nimport { b } from '@puni/shared-testing';\nexport const c = process.cwd();",
  ],
  [
    'the adapters index re-exporting a repository',
    'libs/puni/shared/adapters/src/index.ts',
    "export { a } from './y.repository';",
  ],
  [
    'an index re-exporting a module, contract and command',
    `${check}/index.ts`,
    "export { a } from './module';\nexport type { B } from './contract';\nexport { c } from './y.command';",
  ],
];

describe('file kinds', () => {
  test.each(refused)('%s is refused', async (_name, path, source, rule) => {
    expect(await lintRestrictions(path, source)).toContain(rule);
  });

  test.each(allowed)('%s is allowed', async (_name, path, source) => {
    expect(await lintRestrictions(path, source)).toEqual([]);
  });
});
