import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * File kinds and the one direction between them (command → feature → rule → resource → port),
 * declared by suffix. A library file with no suffix and no wiring name is domain: pure code that
 * imports no other kind and no runtime. Tests, the testing library and the app are free of the
 * kind blocks; every file is barred from another library's files and from dynamic imports.
 */
const kinds = ['command', 'feature', 'rule', 'resource', 'repository', 'port'];
const wiringNames = ['contract', 'module', 'module.check', 'failures', 'group', 'index'];
const tests = ['**/*.test.ts', '**/*.test-host.ts'];
const testingLibrary = 'libs/puni/shared/testing/**';
const exempt = [...tests, testingLibrary];

const forbiddenKinds = {
  command: ['feature', 'rule', 'resource', 'repository', 'port'],
  feature: ['command', 'repository', 'port'],
  rule: ['command', 'feature', 'repository', 'port'],
  resource: ['command', 'feature', 'rule', 'repository'],
  repository: ['command', 'feature', 'rule', 'resource'],
  port: ['command', 'feature', 'rule', 'resource', 'repository'],
  domain: kinds,
};

const intoLibraryFiles = {
  group: ['**/src/**', '**/src'],
  message: 'import another library through its @puni/* alias, never its files',
};
const runtime = {
  group: ['node:*', '!node:path', 'bun', 'bun:*'],
  message: 'only .repository.ts files and the app reach the runtime; node:path is allowed',
};
const hostLibraries = {
  group: ['@puni/shared-adapters', '@puni/shared-testing'],
  message: 'adapters are supplied by the app composition, testing helpers only to tests',
};
const ports = {
  group: ['@puni/shared-ports'],
  message: 'ports are seen only by .resource.ts, .repository.ts, .port.ts, contract.ts and tests',
};

function kindImports(kind) {
  const names = forbiddenKinds[kind];
  return {
    group: names.map((name) => `*.${name}`),
    message: `a ${kind} file may not import ${names.map((name) => `.${name}.ts`).join(', ')}`,
  };
}

function restrictImports(...patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

const runtimeGlobals = {
  'no-restricted-globals': [
    'error',
    ...['Bun', 'process', 'fetch'].map((name) => ({
      name,
      message: 'only .repository.ts files and the app reach the runtime',
    })),
  ],
};

const dynamicImport = {
  selector: 'ImportExpression',
  message: 'only apps/puni/cli/src/entrypoint.ts imports dynamically',
};
const reExportedKinds = ['resource', 'feature', 'rule', 'repository'].flatMap((kind) =>
  ['ExportNamedDeclaration', 'ExportAllDeclaration'].map((node) => ({
    selector: `${node}[source.value=/\\.${kind}$/]`,
    message: `a library index exports modules, contracts, commands and domain, not .${kind}.ts files`,
  })),
);

function kindBlock(kind) {
  const reachesRuntime = kind === 'repository';
  const seesPorts = ['resource', 'repository', 'port'].includes(kind);
  return {
    files: [`libs/**/src/**/*.${kind}.ts`],
    ignores: exempt,
    rules: {
      ...restrictImports(
        intoLibraryFiles,
        hostLibraries,
        kindImports(kind),
        ...(reachesRuntime ? [] : [runtime]),
        ...(seesPorts ? [] : [ports]),
      ),
      ...(reachesRuntime ? {} : runtimeGlobals),
    },
  };
}

const wiringFiles = (names) => names.map((name) => `libs/**/src/**/${name}.ts`);

export default tseslint.config(
  { ignores: ['dist/', '.nx/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['**/*.ts'],
    rules: {
      ...restrictImports(intoLibraryFiles),
      'no-restricted-syntax': ['error', dynamicImport],
    },
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
  ...kinds.map(kindBlock),
  {
    files: ['libs/**/src/**/*.ts'],
    ignores: [...kinds.map((kind) => `**/*.${kind}.ts`), ...wiringFiles(wiringNames), ...exempt],
    rules: {
      ...restrictImports(intoLibraryFiles, hostLibraries, runtime, ports, kindImports('domain')),
      ...runtimeGlobals,
    },
  },
  {
    files: wiringFiles(['contract']),
    ignores: exempt,
    rules: { ...restrictImports(intoLibraryFiles, hostLibraries, runtime), ...runtimeGlobals },
  },
  {
    files: wiringFiles(wiringNames.filter((name) => name !== 'contract')),
    ignores: exempt,
    rules: {
      ...restrictImports(intoLibraryFiles, hostLibraries, runtime, ports),
      ...runtimeGlobals,
    },
  },
  {
    files: ['libs/**/src/index.ts'],
    ignores: ['libs/puni/shared/adapters/src/index.ts'],
    rules: { 'no-restricted-syntax': ['error', dynamicImport, ...reExportedKinds] },
  },
  prettier,
);
