import { formatMessage, getDocPageSync } from '@optique/core';
import type { CliProgram } from './program';

/** One command of the CLI tree: its full canonical path, such as `puni burokrat`, and brief. */
export interface CommandBrief {
  readonly path: string;
  readonly brief: string;
}

/** Every command of the composed CLI; a group library cannot see the whole tree. */
export interface CommandCatalog {
  list(): readonly CommandBrief[];
}

/**
 * Every group and leaf of `program`'s tree, read from the doc pages of its parser: each command
 * entry on the page at a path is a child, visited in turn. Paths use canonical names; help and
 * completion, which the runner adds, are not part of the tree.
 *
 * @throws Error when a page cannot be built or a command has no brief.
 */
export function listCommands<Value>(program: CliProgram<Value>): CommandBrief[] {
  const commands: CommandBrief[] = [];
  const visit = (path: readonly string[]): void => {
    const page = getDocPageSync(program.parser, path);
    if (page === undefined) throw new Error(`no doc page for ${[program.name, ...path].join(' ')}`);
    for (const entry of page.sections.flatMap((section) => section.entries)) {
      if (entry.term.type !== 'command') continue;
      const childPath = [...path, entry.term.name];
      const fullPath = [program.name, ...childPath].join(' ');
      if (entry.description === undefined) throw new Error(`${fullPath} has no brief`);
      commands.push({ path: fullPath, brief: formatMessage(entry.description, { colors: false }) });
      visit(childPath);
    }
  };
  visit([]);
  return commands;
}
