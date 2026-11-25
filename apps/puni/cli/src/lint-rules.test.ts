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

/** The ids of every rule `source` breaks as the file at `path`, Nx boundaries left aside. */
async function lintRules(path: string, source: string): Promise<string[]> {
  const [report] = await eslint.lintText(`${source}\n`, { filePath: join(root, path) });
  return (report?.messages ?? [])
    .map((entry) => entry.ruleId ?? `unused directive: ${entry.message}`)
    .filter((rule) => rule !== '@nx/enforce-module-boundaries');
}

const check = 'libs/puni/burokrat/check/src';
const longFile = Array.from(
  { length: 401 },
  (_line, index) => `export const a${String(index)} = 1;`,
);

const refused: readonly (readonly [string, string, string, string])[] = [
  ['a production file over 400 lines', `${check}/x.ts`, longFile.join('\n'), 'max-lines'],
  ['a variable named data', `${check}/x.ts`, 'export const data = 1;', 'id-denylist'],
  [
    'a parameter named item',
    `${check}/x.test.ts`,
    'export const f = (item: number) => item;',
    'id-denylist',
  ],
  [
    'a disable directive without a description',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger\ndebugger;',
    '@eslint-community/eslint-comments/require-description',
  ],
  [
    'a disable directive that disables nothing',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger -- nothing here stops\nexport const a = 1;',
    "unused directive: Unused eslint-disable directive (no problems were reported from 'no-debugger').",
  ],
  [
    'a @param naming no parameter',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param b the other\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/check-param-names',
  ],
  [
    'an unknown tag',
    `${check}/x.ts`,
    '/** @frobnicate */\nexport const a = 1;',
    'jsdoc/check-tag-names',
  ],
  [
    'a JSDoc type in TypeScript',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param {number} a the number\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/no-types',
  ],
  [
    'a @param without a description',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @param a\n */\nexport function f(a: number): number {\n  return a;\n}',
    'jsdoc/require-param-description',
  ],
  [
    'a @returns without a description',
    `${check}/x.ts`,
    '/**\n * Adds.\n *\n * @returns\n */\nexport function f(): number {\n  return 1;\n}',
    'jsdoc/require-returns-description',
  ],
  [
    'an empty tag with content',
    `${check}/x.ts`,
    '/** @internal yes */\nexport const a = 1;',
    'jsdoc/empty-tags',
  ],
  [
    'a rule reading Date.now',
    `${check}/x.rule.ts`,
    'export const a = Date.now();',
    'no-restricted-properties',
  ],
  [
    'a feature constructing the current date',
    `${check}/x.feature.ts`,
    'export const a = new Date();',
    'no-restricted-syntax',
  ],
  [
    'a resource reading performance.now',
    `${check}/x.resource.ts`,
    'export const a = performance.now();',
    'no-restricted-properties',
  ],
  [
    'domain reading Bun.nanoseconds',
    `${check}/x.ts`,
    'export const a = Bun.nanoseconds();',
    'no-restricted-properties',
  ],
  ['a rule calling Date', `${check}/x.rule.ts`, 'export const a = Date();', 'no-restricted-syntax'],
  [
    'a rule reading globalThis.Date.now',
    `${check}/x.rule.ts`,
    'export const a = globalThis.Date.now();',
    'no-restricted-properties',
  ],
  [
    'a feature constructing globalThis.Date',
    `${check}/x.feature.ts`,
    'export const a = new globalThis.Date();',
    'no-restricted-properties',
  ],
  [
    'a command constructing the current date',
    `${check}/x.command.ts`,
    'export const a = new Date();',
    'no-restricted-syntax',
  ],
  [
    'wiring reading Date.now',
    `${check}/group.ts`,
    'export const a = Date.now();',
    'no-restricted-properties',
  ],
  ['domain writing to the console', `${check}/x.ts`, "console.log('x');", 'no-console'],
  [
    'a repository writing to the console',
    'libs/puni/shared/adapters/src/x.repository.ts',
    "console.error('x');",
    'no-console',
  ],
  [
    'an exported function without JSDoc',
    `${check}/x.ts`,
    'export function f(): number {\n  return 1;\n}',
    'jsdoc/require-jsdoc',
  ],
  [
    'an exported constant without JSDoc',
    `${check}/x.ts`,
    'export const a = 1;',
    'jsdoc/require-jsdoc',
  ],
  [
    'an exported interface without JSDoc',
    `${check}/x.ts`,
    'export interface A {\n  readonly b: number;\n}',
    'jsdoc/require-jsdoc',
  ],
  [
    'an exported type without JSDoc',
    `${check}/x.ts`,
    'export type A = number;',
    'jsdoc/require-jsdoc',
  ],
  [
    'an app export without JSDoc',
    'apps/puni/cli/src/main.ts',
    'export const a = 1;',
    'jsdoc/require-jsdoc',
  ],
  [
    'a local export list in a library file',
    `${check}/x.ts`,
    'const a = 1;\nexport { a };',
    'no-restricted-syntax',
  ],
  [
    'a local export list in a rule',
    `${check}/x.rule.ts`,
    'const a = 1;\nexport { a };',
    'no-restricted-syntax',
  ],
  [
    'a local export list in the app',
    'apps/puni/cli/src/main.ts',
    'const a = 1;\nexport { a };',
    'no-restricted-syntax',
  ],
  [
    'a test using toThrow',
    `${check}/x.test.ts`,
    'expect(() => 1).toThrow();',
    'no-restricted-syntax',
  ],
  [
    'a test using toThrowError',
    `${check}/x.test.ts`,
    'expect(() => 1).toThrowError();',
    'no-restricted-syntax',
  ],
];

const allowed: readonly (readonly [string, string, string])[] = [
  ['a test over 400 lines', `${check}/x.test.ts`, longFile.join('\n')],
  ['domain constructing a given date', `${check}/x.ts`, '/** A. */\nexport const a = new Date(0);'],
  [
    'a command constructing a given date',
    `${check}/x.command.ts`,
    '/** A. */\nexport const a = new Date(0);',
  ],
  ['a test writing to the console', `${check}/x.test.ts`, "console.log('x');"],
  ['the app writing to the console', 'apps/puni/cli/src/main.ts', "console.log('x');"],
  [
    'a repository reading the clock',
    'libs/puni/shared/adapters/src/x.repository.ts',
    '/** A. */\nexport const a = Date.now();',
  ],
  ['a re-export from another module', `${check}/x.ts`, "export { a } from './y';"],
  [
    'an exported declaration of a test without JSDoc',
    `${check}/x.test-host.ts`,
    'export function f(): number {\n  return 1;\n}',
  ],
  [
    'an unexported declaration without JSDoc',
    `${check}/x.ts`,
    'function f(): number {\n  return 1;\n}\n/** G. */\nexport function g(): number {\n  return f();\n}',
  ],
  [
    'a described disable directive that disables a problem',
    `${check}/x.ts`,
    '// eslint-disable-next-line no-debugger -- the probe stops here\ndebugger;',
  ],
];

describe('the repository lint rules', () => {
  test.each(refused)('%s is refused', async (_name, path, source, rule) => {
    expect(await lintRules(path, source)).toContain(rule);
  });

  test.each(allowed)('%s is allowed', async (_name, path, source) => {
    expect(await lintRules(path, source)).toEqual([]);
  });
});

/**
 * The repository's ESLint configuration with type information: a virtual file under the probe
 * name gets the default project, as a file on disk gets its library's.
 */
const typedEslint = new ESLint({
  cwd: root,
  overrideConfig: [
    {
      files: ['**/*.ts'],
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject: [`${check}/probe-*.ts`],
            defaultProject: 'tsconfig.base.json',
          },
          tsconfigRootDir: root,
        },
      },
    },
  ],
});

async function lintTyped(path: string, source: string): Promise<string[]> {
  const [report] = await typedEslint.lintText(`${source}\n`, { filePath: join(root, path) });
  return (report?.messages ?? []).map((entry) => entry.ruleId ?? `fatal: ${entry.message}`);
}

describe('the type-checked lint rules', () => {
  const assertion = "/** A. */\nexport const a = JSON.parse('{}') as { a: number };";

  test('an unchecked type assertion in production code is refused', async () => {
    expect(await lintTyped(`${check}/probe-x.ts`, assertion)).toEqual([
      '@typescript-eslint/no-unsafe-type-assertion',
    ]);
  });

  test('an unchecked type assertion in a test is allowed', async () => {
    expect(await lintTyped(`${check}/probe-x.test.ts`, assertion)).toEqual([]);
  });
});

/** The tags the module-boundary rule lets a file at `path` tagged `source` import. */
async function readAllowedTags(path: string, source: string): Promise<readonly string[]> {
  const config: unknown = await eslint.calculateConfigForFile(join(root, path));
  const rules = (config as { rules?: Record<string, unknown> }).rules ?? {};
  const [, options] = (rules['@nx/enforce-module-boundaries'] ?? []) as [
    unknown,
    { depConstraints: { sourceTag: string; onlyDependOnLibsWithTags: string[] }[] },
  ];
  return options.depConstraints
    .filter(({ sourceTag }) => sourceTag === source)
    .flatMap(({ onlyDependOnLibsWithTags }) => onlyDependOnLibsWithTags);
}

/**
 * A plugin is the tech-specific side of a shared interface: only the app, which composes it, and
 * tests may import it, so no core library comes to depend on a tool. The rule itself needs the
 * Nx project graph, which `nx run <project>:lint` gives; this pins what it is configured with.
 */
describe('the plugin boundary', () => {
  test('a group or shared library may not import a plugin; its tests may', async () => {
    for (const tag of ['type:group', 'type:shared']) {
      expect(await readAllowedTags(`${check}/x.ts`, tag)).not.toContain('type:plugin');
      expect(await readAllowedTags(`${check}/x.test.ts`, tag)).toContain('type:plugin');
    }
  });

  test('a plugin imports only shared libraries, and the app anything', async () => {
    expect(await readAllowedTags('libs/puni/shared/nx/src/x.ts', 'type:plugin')).toEqual([
      'type:shared',
    ]);
    expect(await readAllowedTags('apps/puni/cli/src/x.ts', 'scope:app')).toEqual(['*']);
  });

  test('the Nx project source is the plugin', async () => {
    const project: unknown = await Bun.file(join(root, 'libs/puni/shared/nx/project.json')).json();
    expect((project as { tags: string[] }).tags).toEqual(['scope:shared', 'type:plugin']);
  });
});
