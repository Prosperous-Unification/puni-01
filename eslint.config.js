import comments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

/**
 * File kinds and the one direction between them (command → feature → rule → resource → port),
 * declared by suffix. Wiring names (`contract`, `failures`, `group`, `index`, `module`,
 * `module.check`) count only at a library's `src/` root; any other library file with no suffix is
 * domain: pure code that imports no other kind and no runtime. Tests and the testing library are
 * free of the kind blocks; no other file imports a test, and every file is barred from another
 * library's files, from dynamic imports and from `process.exit`. Library code reads no clock but
 * in a repository, and writes no console; tests do not use `.toThrow`.
 */
const kinds = ['command', 'feature', 'rule', 'resource', 'repository', 'port'];
const tests = ['**/*.test.ts', '**/*.test-host.ts'];
const testingLibrary = 'libs/puni/shared/testing/**';
const exempt = [...tests, testingLibrary];

/** Each kind and the kinds its files may not import. */
const forbiddenKinds = {
  command: ['feature', 'rule', 'resource', 'repository', 'port'],
  feature: ['command', 'feature', 'resource', 'repository', 'port'],
  rule: ['command', 'feature', 'resource', 'repository', 'port'],
  resource: ['command', 'feature', 'rule', 'repository'],
  repository: ['command', 'feature', 'rule', 'resource'],
  port: ['command', 'feature', 'rule', 'resource', 'repository'],
  domain: kinds,
};

/** Each wiring name at a library's `src/` root and the kinds its file may not import. */
const forbiddenByWiring = {
  contract: kinds,
  failures: kinds,
  group: ['feature', 'rule', 'resource', 'repository', 'port'],
  index: ['feature', 'rule', 'resource', 'repository'],
  module: ['repository', 'port'],
  'module.check': ['repository', 'port'],
};

/** A specifier naming a file of one of `names`, with or without an extension. */
function kindSpecifier(names) {
  return `\\.(${names.join('|')})(\\.[cm]?[jt]s)?$`;
}

/**
 * `module.ts` registers services only from files of a kind, so no file without a suffix escapes
 * the kind rules by being registered; it may also import the wiring at its source root.
 */
const unsuffixedModuleImport = {
  regex: `^\\.{1,2}/(?!(?:[^/]+/)*[^/]+${kindSpecifier(['command', 'feature', 'rule', 'resource', 'repository'])})(?!(?:contract|failures|group|index)(?:\\.[cm]?[jt]s)?$)`,
  message:
    'module.ts registers only .command, .feature, .rule, .resource and .repository files; give the file its kind',
};

const intoLibraryFiles = {
  group: ['**/src/**', '**/src'],
  message: 'import another library through its @puni/* alias, never its files',
};
const testFiles = {
  regex: '\\.test(-host)?(\\.[cm]?[jt]s)?$',
  message: 'only tests import tests and test hosts',
};
const runtimeModules = builtinModules
  .filter((name) => name !== 'path' && !name.includes(':'))
  .map((name) => name.replace(/[/]/gu, '\\/'));
const runtime = {
  regex: `^((node:)?(${runtimeModules.join('|')})(\\/.*)?|bun(:.*)?)$`,
  message: 'only .repository.ts files and the app reach the runtime; path is allowed',
};
const hostLibraries = {
  group: ['@puni/shared-adapters', '@puni/shared-testing'],
  message: 'adapters are supplied by the app composition, testing helpers only to tests',
};
const groupLibraries = {
  regex: '^@puni/(?!shared-)',
  message: 'a library imports only shared libraries; groups are composed by the app',
};
const testingLibraryImport = {
  group: ['@puni/shared-testing'],
  message: 'testing helpers are only for tests',
};
const ports = {
  group: ['@puni/shared-ports'],
  message:
    'ports are seen only by .resource.ts, .repository.ts, .port.ts, a shared contract.ts and tests',
};

function forbidKinds(owner, names) {
  return {
    regex: kindSpecifier(names),
    message: `${owner} may not import ${names.map((name) => `.${name}`).join(', ')} files`,
  };
}

function restrictImports(...patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

const runtimeMessage = 'only .repository.ts files and the app reach the runtime';
const runtimeGlobals = {
  'no-restricted-globals': [
    'error',
    ...['Bun', 'process', 'fetch', 'require'].map((name) => ({ name, message: runtimeMessage })),
  ],
};

const processExit = {
  object: 'process',
  property: 'exit',
  message: 'set process.exitCode and return; nothing calls process.exit',
};
const globalRuntime = ['process', 'Bun', 'fetch', 'require'].map((property) => ({
  object: 'globalThis',
  property,
  message: runtimeMessage,
}));
const metaRequire = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='require']",
  message: runtimeMessage,
};
const dynamicImport = {
  selector: 'ImportExpression',
  message: 'only apps/puni/cli/src/entrypoint.ts imports dynamically',
};
/** A local `export { … }` list: it would export declarations `jsdoc/require-jsdoc` never sees. */
const localExportList = {
  selector: 'ExportNamedDeclaration[source=null][declaration=null]',
  message: 'export each declaration where it is declared, or re-export with `export … from`',
};

/**
 * Library boundaries by Nx tag, written on the importing side. A role library depends only on
 * shared libraries; a group or shared library imports no adapters and no app, and only a test
 * imports `type:testing`; the app composes everything. Those last are `onlyDependOnLibsWithTags` lists, which judge direct
 * imports: `notDependOnLibsWithTags` walks the whole project graph, where a library's own tests
 * already reach the adapters through the testing library. The rule reads the Nx project graph
 * and passes silently without one, so it is proven through `nx run <project>:lint`.
 */
function moduleBoundaries({ testing }) {
  const testingTags = testing ? ['type:testing'] : [];
  return {
    '@nx/enforce-module-boundaries': [
      'error',
      {
        depConstraints: [
          ...['scope:navigator', 'scope:dash', 'scope:burokrat', 'scope:shared'].map((tag) => ({
            sourceTag: tag,
            onlyDependOnLibsWithTags: ['scope:shared'],
          })),
          {
            sourceTag: 'type:group',
            onlyDependOnLibsWithTags: ['type:group', 'type:shared', ...testingTags],
          },
          { sourceTag: 'type:shared', onlyDependOnLibsWithTags: ['type:shared', ...testingTags] },
          { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['*'] },
        ],
      },
    ],
  };
}

const clockMessage =
  'library code takes time as input (a feature declares clock: Clock); only repositories read a clock';
const clock = {
  properties: [
    ['Date', 'now'],
    ['performance', 'now'],
    ['Bun', 'nanoseconds'],
    ['globalThis', 'Date'],
  ].map(([object, property]) => ({ object, property, message: clockMessage })),
  syntax: [
    "NewExpression[callee.name='Date'][arguments.length=0]",
    "CallExpression[callee.name='Date']",
  ].map((selector) => ({ selector, message: clockMessage })),
};

const toThrow = {
  selector: 'CallExpression[callee.property.name=/^toThrow/]',
  message:
    "use node:assert/strict throws or rejects: under Bun 1.4.5 `expect(() => new Error('x')).toThrow()` passes although nothing is thrown",
};

/** The imports every non-test library file is refused, with its own kind list; ports optional. */
function libraryImports(kindPattern, seesPorts, reachesRuntime = false) {
  return [
    intoLibraryFiles,
    testFiles,
    hostLibraries,
    groupLibraries,
    kindPattern,
    ...(reachesRuntime ? [] : [runtime]),
    ...(seesPorts ? [] : [ports]),
  ];
}

/** The runtime and clock rules of a library file of `kind`. */
function libraryRuntime(kind) {
  const reachesRuntime = kind === 'repository';
  const readsNoClock = kind !== 'repository' && kind !== 'port';
  return {
    ...(reachesRuntime ? {} : runtimeGlobals),
    'no-restricted-properties': [
      'error',
      processExit,
      ...(reachesRuntime ? [] : globalRuntime),
      ...(readsNoClock ? clock.properties : []),
    ],
    'no-restricted-syntax': [
      'error',
      dynamicImport,
      localExportList,
      ...(reachesRuntime ? [] : [metaRequire]),
      ...(readsNoClock ? clock.syntax : []),
    ],
  };
}

const wiringRoots = (name) => [`libs/*/*/*/src/${name}.ts`];

/** The block of every library file of `kind`; domain is any file of no kind and no wiring name. */
function libraryBlock(kind) {
  const seesPorts = ['resource', 'repository', 'port'].includes(kind);
  const files = kind === 'domain' ? ['libs/**/src/**/*.ts'] : [`libs/**/src/**/*.${kind}.ts`];
  const ignores =
    kind === 'domain'
      ? [
          ...kinds.map((name) => `**/*.${name}.ts`),
          ...Object.keys(forbiddenByWiring).flatMap(wiringRoots),
          ...exempt,
        ]
      : exempt;
  return {
    files,
    ignores,
    rules: {
      ...restrictImports(
        ...libraryImports(
          forbidKinds(`a ${kind} file`, forbiddenKinds[kind]),
          seesPorts,
          kind === 'repository',
        ),
      ),
      ...libraryRuntime(kind),
    },
  };
}

/** The block of the wiring file `name` at each library's `src/` root. */
function wiringBlock(name) {
  return {
    files: wiringRoots(name),
    ignores: [...exempt, ...(name === 'index' ? ['libs/puni/shared/adapters/src/index.ts'] : [])],
    rules: {
      ...restrictImports(
        ...libraryImports(forbidKinds(`${name}.ts`, forbiddenByWiring[name]), false),
        ...(name === 'module' ? [unsuffixedModuleImport] : []),
      ),
      ...libraryRuntime('wiring'),
    },
  };
}

const bannedNames = ['data', 'result', 'obj', 'tmp', 'item', 'handle'];

export default tseslint.config(
  { ignores: ['dist/', '.nx/', 'node_modules/', '.worktrees/'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ['**/*.js', '**/*.cjs'], ...tseslint.configs.disableTypeChecked },
  {
    // A CommonJS file, such as the Nx sync generator Nx loads with require, imports by require.
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly' },
    },
  },
  {
    plugins: { '@eslint-community/eslint-comments': comments, jsdoc },
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      'id-denylist': ['error', ...bannedNames],
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
    },
  },
  { files: ['**/*.ts'], rules: { 'jsdoc/no-types': 'error' } },
  {
    // A library documents itself: every declaration a production file exports carries the JSDoc
    // that says what it is, so the reader of a `readFirst` file learns the library from it.
    files: ['**/*.ts'],
    ignores: tests,
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { '@nx': nx },
    rules: {
      ...restrictImports(intoLibraryFiles, testFiles),
      'no-restricted-properties': ['error', processExit],
      'no-restricted-syntax': ['error', dynamicImport, localExportList],
      ...moduleBoundaries({ testing: false }),
    },
  },
  {
    files: ['**/*.ts'],
    ignores: tests,
    rules: {
      'max-lines': ['error', { max: 400, skipComments: true, skipBlankLines: true }],
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
    },
  },
  { files: ['libs/**/*.ts'], ignores: tests, rules: { 'no-console': 'error' } },
  {
    files: tests,
    rules: {
      ...restrictImports(intoLibraryFiles),
      'no-restricted-syntax': ['error', dynamicImport, toThrow],
      ...moduleBoundaries({ testing: true }),
    },
  },
  {
    files: ['apps/**/*.ts'],
    ignores: tests,
    rules: { ...restrictImports(intoLibraryFiles, testFiles, testingLibraryImport) },
  },
  { files: ['apps/puni/cli/src/entrypoint.ts'], rules: { 'no-restricted-syntax': 'off' } },
  {
    // `builder.verifyGraphAtCompileTime() satisfies void;` is di-bag's compile-time graph check:
    // the statement exists only for its type, which these two rules read as a mistake.
    files: ['**/module.check.ts', '**/composition.check.ts'],
    rules: {
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },
  ...Object.keys(forbiddenKinds).map(libraryBlock),
  ...Object.keys(forbiddenByWiring).map(wiringBlock),
  {
    // Repositories live in the adapters library, so its module.ts is the one that registers them.
    files: ['libs/puni/shared/adapters/src/module.ts'],
    rules: {
      ...restrictImports(
        ...libraryImports(forbidKinds('module.ts', ['port']), false),
        unsuffixedModuleImport,
      ),
    },
  },
  {
    files: ['libs/puni/shared/*/src/contract.ts'],
    rules: {
      ...restrictImports(
        ...libraryImports(forbidKinds('contract.ts', forbiddenByWiring.contract), true),
      ),
    },
  },
  prettier,
);
