import type { MissingTypes, SourceReader } from '@puni/shared-checkout';
import type ts from 'typescript';

/**
 * The TypeScript compiler, loaded when first asked for: its module, and the texts of the global
 * declarations a file may name without importing them.
 */
export interface TypescriptCompiler {
  /** The compiler's module, the same one on every call. */
  load(): typeof ts;
  /** The texts of the global declaration files puni installs, the same ones on every call. */
  globalDeclarationTexts(): readonly string[];
  /**
   * The global declarations the repository at the absolute directory `root` installs, read once
   * per root (see {@link RepositoryDeclarations}).
   */
  repositoryDeclarations(root: string): RepositoryDeclarations;
}

/**
 * What a repository installs for every file to use: the texts of each package of its
 * `node_modules/@types`, of each package its root `tsconfig.json` or `tsconfig.base.json`
 * lists in `compilerOptions.types` (by its relative `extends` chain), and of every declaration
 * file their references reach; and each listed package its `node_modules` does not hold.
 */
export interface RepositoryDeclarations {
  readonly texts: readonly string[];
  readonly missing: readonly MissingTypes[];
}

/**
 * What the TypeScript module exports: the source readers of TypeScript and JavaScript, one per
 * way the compiler parses a file.
 */
export interface TypescriptExports {
  readonly typescriptSourceReaders: readonly SourceReader[];
}
