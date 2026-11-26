import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { type MissingTypes, SourceReaderBroken } from '@puni/shared-checkout';
import type ts from 'typescript';
import type { RepositoryDeclarations, TypescriptCompiler } from './contract';

/** The `/// <reference …/>` directives of a declaration file: each kind and what it names. */
function listReferences(text: string): { readonly kind: string; readonly name: string }[] {
  return [...text.matchAll(/^\/\/\/\s*<reference\s+(lib|path|types)="([^"]+)"\s*\/>/gmu)].map(
    (match) => ({ kind: match[1] ?? '', name: match[2] ?? '' }),
  );
}

/** Whether `loaded` is the compiler's module, by the one function every reading calls first. */
function isCompiler(loaded: unknown): loaded is typeof ts {
  return typeof loaded === 'object' && loaded !== null && 'createSourceFile' in loaded;
}

/** The type packages whose globals a doc comment may link, as puni depends on them. */
export const globalTypePackages: readonly string[] = ['bun-types'];

/** The configuration files at a repository's root whose `compilerOptions.types` it lists. */
const rootConfigs = ['tsconfig.json', 'tsconfig.base.json'] as const;

/**
 * The entry declaration file of the package installed in the directory `directory`: the file its
 * `package.json` names by `types` or `typings`, else its `index.d.ts`; `undefined` when there is
 * none.
 */
function findTypesEntry(directory: string): string | undefined {
  let named: unknown;
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (typeof manifest === 'object' && manifest !== null) {
      named =
        'types' in manifest ? manifest.types : 'typings' in manifest ? manifest.typings : undefined;
    }
  } catch {
    named = undefined;
  }
  const candidates = [...(typeof named === 'string' ? [join(directory, named)] : [])];
  candidates.push(join(directory, 'index.d.ts'));
  return candidates.find((candidate) => existsSync(candidate));
}

/** The installed package directories below `node_modules/@types` of `root`, `@types/a__b` alike. */
function listTypesPackages(root: string): string[] {
  const directory = join(root, 'node_modules', '@types');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join(directory, entry.name))
    .sort();
}

/**
 * The {@link TypescriptCompiler} of this machine: the `typescript` package this puni depends on,
 * required on the first `load` and never before, so a command that reads no source file never
 * pays for it; the global declarations puni installs, read once: the compiler's default library
 * for the latest target and every library it references, then each of `packages` and every
 * declaration file its references reach; and those each repository installs, read once per root.
 *
 * @throws SourceReaderBroken from `load` when the compiler is not installed or is no compiler,
 *   and from `globalDeclarationTexts` when one of `packages` is not installed beside puni.
 */
export function openTypescriptCompiler(packages: readonly string[]): TypescriptCompiler {
  const requireHere = createRequire(import.meta.url);
  const broken = (problem: string, cause?: unknown) =>
    new SourceReaderBroken({ details: { reader: 'TypeScript', problem }, cause });
  let compiler: typeof ts | undefined;
  let globals: readonly string[] | undefined;
  const repositories = new Map<string, RepositoryDeclarations>();
  const load = (): typeof ts => {
    if (compiler !== undefined) return compiler;
    let loaded: unknown;
    try {
      loaded = requireHere('typescript');
    } catch (caught) {
      throw broken('the typescript package is not installed beside puni', caught);
    }
    if (!isCompiler(loaded)) {
      throw broken(
        'the typescript package loaded is no TypeScript compiler: it has no createSourceFile',
      );
    }
    compiler = loaded;
    return compiler;
  };
  const resolveFrom = (file: string, specifier: string): string | undefined => {
    try {
      return createRequire(file).resolve(specifier);
    } catch {
      return undefined;
    }
  };
  /** The texts of `entries` and of every declaration file their references reach, each once. */
  const readReached = (entries: readonly string[]): string[] => {
    const compilerModule = load();
    const libraries = dirname(compilerModule.getDefaultLibFilePath({}));
    const texts: string[] = [];
    const seen = new Set<string>();
    const read = (file: string | undefined): void => {
      if (file === undefined || seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      texts.push(text);
      for (const { kind, name } of listReferences(text)) {
        if (kind === 'lib') read(join(libraries, `lib.${name.toLowerCase()}.d.ts`));
        if (kind === 'path') read(join(dirname(file), name));
        if (kind === 'types') {
          read(
            resolveFrom(file, `@types/${name}/index.d.ts`) ??
              resolveFrom(file, `${name}/index.d.ts`),
          );
        }
      }
    };
    for (const entry of entries) read(entry);
    return texts;
  };
  /** The `compilerOptions.types` a configuration file at `file` gives, by its `extends` chain. */
  const readListedTypes = (file: string, seen: Set<string>): readonly string[] | undefined => {
    if (seen.has(file) || !existsSync(file)) return undefined;
    seen.add(file);
    const parsed: { readonly config?: unknown } = load().parseConfigFileTextToJson(
      file,
      readFileSync(file, 'utf8'),
    );
    const config = parsed.config;
    if (typeof config !== 'object' || config === null) return undefined;
    const options: unknown = 'compilerOptions' in config ? config.compilerOptions : undefined;
    const types: unknown =
      typeof options === 'object' && options !== null && 'types' in options
        ? options.types
        : undefined;
    if (Array.isArray(types)) return types.filter((name) => typeof name === 'string');
    const parents: unknown = 'extends' in config ? config.extends : undefined;
    for (const parent of [parents].flat()) {
      if (typeof parent !== 'string' || !parent.startsWith('.')) continue;
      const named = join(dirname(file), parent);
      const listed = readListedTypes(named.endsWith('.json') ? named : `${named}.json`, seen);
      if (listed !== undefined) return listed;
    }
    return undefined;
  };
  return {
    load,
    globalDeclarationTexts() {
      if (globals !== undefined) return globals;
      const compilerModule = load();
      const entries = [
        compilerModule.getDefaultLibFilePath({ target: compilerModule.ScriptTarget.Latest }),
      ];
      for (const name of packages) {
        const entry = resolveFrom(import.meta.filename, `${name}/index.d.ts`);
        if (entry === undefined) {
          throw broken(`the global types of ${name} are not installed beside puni`);
        }
        entries.push(entry);
      }
      globals = readReached(entries);
      return globals;
    },
    repositoryDeclarations(root) {
      const known = repositories.get(root);
      if (known !== undefined) return known;
      const entries = listTypesPackages(root).flatMap(
        (directory) => findTypesEntry(directory) ?? [],
      );
      const missing: MissingTypes[] = [];
      for (const config of rootConfigs) {
        const file = join(root, config);
        for (const name of readListedTypes(file, new Set()) ?? []) {
          const entry =
            (isAbsolute(name)
              ? undefined
              : findTypesEntry(join(root, 'node_modules', '@types', name))) ??
            findTypesEntry(join(root, 'node_modules', name));
          if (entry !== undefined) entries.push(entry);
          else if (!missing.some((known) => known.name === name)) {
            missing.push({ name, listedIn: relative(root, file) });
          }
        }
      }
      const read = { texts: readReached(entries), missing };
      repositories.set(root, read);
      return read;
    },
  };
}

/** The {@link openTypescriptCompiler} of the {@link globalTypePackages} puni depends on. */
export function createTypescriptCompiler(): TypescriptCompiler {
  return openTypescriptCompiler(globalTypePackages);
}
