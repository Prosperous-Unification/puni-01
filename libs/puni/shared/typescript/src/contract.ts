import type { SourceReader } from '@puni/shared-checkout';
import type ts from 'typescript';

/**
 * The TypeScript compiler, loaded when first asked for: its module, and the texts of the global
 * declarations a file may name without importing them.
 */
export interface TypescriptCompiler {
  /** The compiler's module, the same one on every call. */
  load(): typeof ts;
  /** The texts of the global declaration files available, the same ones on every call. */
  globalDeclarationTexts(): readonly string[];
}

/**
 * What the TypeScript module exports: the source readers of TypeScript and JavaScript, one per
 * way the compiler parses a file.
 */
export interface TypescriptExports {
  readonly typescriptSourceReaders: readonly SourceReader[];
}
