import type { SourceReader } from '@puni/shared-checkout';

/**
 * What the TypeScript module exports: the source readers of TypeScript and JavaScript, one per
 * way the compiler parses a file.
 */
export interface TypescriptExports {
  readonly typescriptSourceReaders: readonly SourceReader[];
}
