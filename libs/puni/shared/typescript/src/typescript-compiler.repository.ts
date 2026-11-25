import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type ts from 'typescript';
import type { TypescriptCompiler } from './contract';
import { GlobalTypesMissing } from './failures';

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

/**
 * The {@link TypescriptCompiler} of this machine: the `typescript` package this puni depends on,
 * required on the first `load` and never before, so a command that reads no source file never
 * pays for it; and the global declarations, read once: the compiler's default library for the
 * latest target and every library it references, then each of `packages` and every declaration
 * file its references reach.
 *
 * @throws GlobalTypesMissing from `globalDeclarationTexts` when one of `packages` is not
 *   installed beside puni.
 */
export function openTypescriptCompiler(packages: readonly string[]): TypescriptCompiler {
  const requireHere = createRequire(import.meta.url);
  let compiler: typeof ts | undefined;
  let globals: readonly string[] | undefined;
  const load = (): typeof ts => {
    if (compiler !== undefined) return compiler;
    const loaded: unknown = requireHere('typescript');
    if (!isCompiler(loaded)) {
      throw new Error(
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
  return {
    load,
    globalDeclarationTexts() {
      if (globals !== undefined) return globals;
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
      read(compilerModule.getDefaultLibFilePath({ target: compilerModule.ScriptTarget.Latest }));
      for (const name of packages) {
        const entry = resolveFrom(import.meta.filename, `${name}/index.d.ts`);
        if (entry === undefined) throw new GlobalTypesMissing({ details: { package: name } });
        read(entry);
      }
      globals = texts;
      return globals;
    },
  };
}

/** The {@link openTypescriptCompiler} of the {@link globalTypePackages} puni depends on. */
export function createTypescriptCompiler(): TypescriptCompiler {
  return openTypescriptCompiler(globalTypePackages);
}
