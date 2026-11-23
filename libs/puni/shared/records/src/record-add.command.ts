import { constant, object, option, optional, string, text } from '@optique/core';
import type { Command } from '@puni/shared-command';
import type { RecordAddRequest, RecordFiling, RecordShape } from './contract';

/**
 * One `<group> add` leaf: the request `kind` its parser yields, the {@link RecordShape} it files,
 * and the words its help is made of.
 */
export interface RecordAddLeaf<Kind extends string> extends RecordShape {
  readonly request: Kind;
  /** What the record is called in help: `plan` gives "The plan's title". */
  readonly noun: string;
  /** What the summary says, completing "<what>, on one line, at most 30 words.". */
  readonly summarises: string;
}

/** What a body made without a body file holds, for the `--body-file` help. */
function describeDefaultBody(sections: readonly string[]): string {
  if (sections.length === 0) return 'a heading of the title';
  const named =
    sections.length === 1 ? sections : [sections.slice(0, -1).join(', '), sections.at(-1)];
  return `a heading of the title, then empty ${named.join(' and ')} sections`;
}

/**
 * `add --title TEXT --topics LIST --summary TEXT [--body-file PATH]`: one record of `leaf` to
 * file, yielding a request of kind `leaf.request`.
 */
export function recordAddParser<Kind extends string>(leaf: RecordAddLeaf<Kind>) {
  return object({
    kind: constant(leaf.request),
    title: option('--title', string({ metavar: 'TEXT' }), {
      description: [text(`The ${leaf.noun}'s title, on one line; its file name is made from it.`)],
    }),
    topics: option('--topics', string({ metavar: 'LIST' }), {
      description: [text('One to five comma-separated topics, such as ops,k3s.')],
    }),
    summary: option('--summary', string({ metavar: 'TEXT' }), {
      description: [text(`${leaf.summarises}, on one line, at most 30 words.`)],
    }),
    bodyFile: optional(
      option('--body-file', string({ metavar: 'PATH' }), {
        description: [
          text(
            `The file holding the ${leaf.noun}'s body (default: ${describeDefaultBody(leaf.sections)}).`,
          ),
        ],
      }),
    ),
  });
}

/**
 * The factory of the `add` command of `leaf`: it files the record in the records repository,
 * prints the new record's path relative to that repository and returns 0; it commits nothing. A
 * refused value, title, existing record or body file prints one `error: ` line and returns 2; a
 * defective repository or an unreadable body file one `error: ` line and 1.
 */
export function createRecordAddCommand<Kind extends string>(leaf: RecordAddLeaf<Kind>) {
  return ({ recordFiling }: { recordFiling: RecordFiling }): Command<RecordAddRequest<Kind>> => ({
    run(request, io) {
      const outcome = recordFiling.file(io.cwd, leaf, request);
      switch (outcome.kind) {
        case 'filed':
          io.stdout(`${outcome.path}\n`);
          return 0;
        case 'refused':
          io.stderr(`error: ${outcome.reason}\n`);
          return 2;
        case 'defective':
          io.stderr(`error: ${outcome.reason}\n`);
          return 1;
      }
    },
  });
}
