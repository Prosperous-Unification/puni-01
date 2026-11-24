import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type ts from 'typescript';
import type { TypescriptCompiler } from './contract';

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

/**
 * The {@link TypescriptCompiler} of this machine: the `typescript` package this puni depends on,
 * required on the first `load` and never before, so a command that reads no source file never
 * pays for it; and the global declarations, read once: the compiler's default library for the
 * latest target and every library it references, then `bun-types` and the types it references,
 * when they are installed beside puni. Types not installed are simply not read.
 */
export function createTypescriptCompiler(): TypescriptCompiler {
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
      read(resolveFrom(import.meta.filename, 'bun-types/index.d.ts'));
      globals = texts;
      return globals;
    },
  };
}
