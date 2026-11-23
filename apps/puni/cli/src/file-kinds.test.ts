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

const restricted = [
  'no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
];

async function lintRestrictions(path: string, source: string): Promise<string[]> {
  const [report] = await eslint.lintText(`${source}\n`, { filePath: join(root, path) });
  return (report?.messages ?? [])
    .map((entry) => entry.ruleId ?? `fatal: ${entry.message}`)
    .filter((rule) => restricted.includes(rule) || rule.startsWith('fatal'));
}

const check = 'libs/puni/burokrat/check/src';

const refused: readonly (readonly [string, string, string, string])[] = [
  [
    'a feature importing a repository with a .js extension',
    `${check}/x.feature.ts`,
    "import { a } from './y.repository.js';",
    'no-restricted-imports',
  ],
  [
    'a command importing a repository with a .ts extension',
    `${check}/x.command.ts`,
    "import { a } from './y.repository.ts';",
    'no-restricted-imports',
  ],
  [
    'an index re-exporting a resource with a .js extension',
    `${check}/index.ts`,
    "export { a } from './y.resource.js';",
    'no-restricted-imports',
  ],
  [
    'domain reaching fs without the node: prefix',
    `${check}/x.ts`,
    "import { a } from 'fs';",
    'no-restricted-imports',
  ],
  [
    'domain reaching child_process without the node: prefix',
    `${check}/x.ts`,
    "import { a } from 'child_process';",
    'no-restricted-imports',
  ],
  [
    'a rule reaching fs/promises',
    `${check}/x.rule.ts`,
    "import { a } from 'fs/promises';",
    'no-restricted-imports',
  ],
  [
    'a rule reaching node:fs/promises',
    `${check}/x.rule.ts`,
    "import { a } from 'node:fs/promises';",
    'no-restricted-imports',
  ],
  [
    'a feature reading globalThis.process',
    `${check}/x.feature.ts`,
    'export const a = globalThis.process.cwd();',
    'no-restricted-properties',
  ],
  [
    'a feature reading globalThis.Bun',
    `${check}/x.feature.ts`,
    'export const a = globalThis.Bun.version;',
    'no-restricted-properties',
  ],
  [
    'a resource reading globalThis.fetch',
    `${check}/x.resource.ts`,
    'export const a = globalThis.fetch;',
    'no-restricted-properties',
  ],
  [
    'domain calling require',
    `${check}/x.ts`,
    "export const a: unknown = require('node:fs');",
    'no-restricted-globals',
  ],
  [
    'domain calling import.meta.require',
    `${check}/x.ts`,
    "export const a: unknown = import.meta.require('node:fs');",
    'no-restricted-syntax',
  ],
  [
    'a feature importing a resource implementation',
    `${check}/x.feature.ts`,
    "import { a } from './y.resource';",
    'no-restricted-imports',
  ],
  [
    'a rule importing a resource implementation',
    `${check}/rules/x.rule.ts`,
    "import { a } from '../y.resource';",
    'no-restricted-imports',
  ],
  [
    'a feature importing another feature',
    `${check}/x.feature.ts`,
    "import { a } from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'group.ts importing a feature',
    `${check}/group.ts`,
    "import { a } from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'group.ts importing a resource',
    `${check}/group.ts`,
    "import { a } from './y.resource';",
    'no-restricted-imports',
  ],
  [
    'failures.ts importing a repository',
    `${check}/failures.ts`,
    "import { a } from './y.repository';",
    'no-restricted-imports',
  ],
  [
    'contract.ts importing a feature',
    `${check}/contract.ts`,
    "import type { A } from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'a nested index.ts importing a resource',
    `${check}/rules/index.ts`,
    "export { a } from '../y.resource';",
    'no-restricted-imports',
  ],
  [
    'index.ts importing a rule and then exporting it',
    `${check}/index.ts`,
    "import { a } from './y.rule';\nexport { a };",
    'no-restricted-imports',
  ],
  [
    'a production file importing a test host',
    `${check}/x.ts`,
    "import { a } from './check.test-host';",
    'no-restricted-imports',
  ],
  [
    'a production file importing a test',
    `${check}/x.feature.ts`,
    "import { a } from './x.test';",
    'no-restricted-imports',
  ],
  [
    'a group contract.ts re-exporting the ports',
    `${check}/contract.ts`,
    "export type { FileSystem } from '@puni/shared-ports';",
    'no-restricted-imports',
  ],
  [
    'the app calling process.exit',
    'apps/puni/cli/src/main.ts',
    'process.exit(1);',
    'no-restricted-properties',
  ],
  [
    'a repository calling process.exit',
    'libs/puni/shared/adapters/src/x.repository.ts',
    'process.exit(1);',
    'no-restricted-properties',
  ],
  [
    'a test calling process.exit',
    `${check}/x.test.ts`,
    'process.exit(1);',
    'no-restricted-properties',
  ],
  [
    'a shared library importing a group library',
    'libs/puni/shared/checkout/src/sneak.ts',
    "import { a } from '@puni/burokrat-check';",
    'no-restricted-imports',
  ],
  [
    'a feature importing a sibling group library',
    `${check}/x.feature.ts`,
    "import { a } from '@puni/burokrat-wiki';",
    'no-restricted-imports',
  ],
  [
    'the app importing the testing library',
    'apps/puni/cli/src/main.ts',
    "import { a } from '@puni/shared-testing';",
    'no-restricted-imports',
  ],
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
    'no-restricted-imports',
  ],
  [
    'an index re-exporting a feature',
    `${check}/index.ts`,
    "export * from './y.feature';",
    'no-restricted-imports',
  ],
  [
    'an index re-exporting a rule',
    `${check}/index.ts`,
    "export { a } from './y.rule';",
    'no-restricted-imports',
  ],
  [
    'an index re-exporting a repository',
    `${check}/index.ts`,
    "export { a } from './y.repository';",
    'no-restricted-imports',
  ],
  [
    'module.ts registering a file without a kind',
    'libs/puni/dash/ops/src/module.ts',
    "import { createRestartCommand } from './restart';",
    'no-restricted-imports',
  ],
  [
    'module.ts registering a nested file without a kind',
    `${check}/module.ts`,
    "import { a } from './rules/x.js';",
    'no-restricted-imports',
  ],
  [
    'a group module.ts registering a repository',
    `${check}/module.ts`,
    "import { a } from './y.repository';",
    'no-restricted-imports',
  ],
  [
    'the adapters module.ts importing a domain file',
    'libs/puni/shared/adapters/src/module.ts',
    "import { a } from './y';",
    'no-restricted-imports',
  ],
];

const allowed: readonly (readonly [string, string, string])[] = [
  [
    'module.ts registering every kind it may and importing its wiring',
    `${check}/module.ts`,
    "import { a } from './y.command';\nimport { b } from './y.feature';\nimport { c } from './rules/y.rule';\nimport { d } from './y.resource.ts';\nimport type { E } from './contract';\nimport { f } from './failures';\nimport { DiBag } from 'di-bag';",
  ],
  [
    'the adapters module.ts registering a repository',
    'libs/puni/shared/adapters/src/module.ts',
    "import { a } from './y.repository';",
  ],
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
    'a shared contract.ts importing the ports',
    'libs/puni/shared/checkout/src/contract.ts',
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
