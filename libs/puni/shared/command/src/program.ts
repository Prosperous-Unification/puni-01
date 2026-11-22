import type { Parser } from '@optique/core';

/** A command-line program: its parser, the name usage lines print, and its version. */
export interface CliProgram<Value> {
  readonly parser: Parser<'sync', Value>;
  readonly name: string;
  readonly version: string;
}
