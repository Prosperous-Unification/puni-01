import { posix } from 'node:path';
import {
  type DocSelection,
  isTypedDocumentation,
  listUnlinkedCode,
  readSymbolSpan,
  selectsDocumentation,
} from '../docs';
import { type Breach, reachesReference, type Rule, type RuleReading } from '../finding';
import { listLinkTargets, resolveTarget } from '../links';
import { listDocComments } from './docs.rule';

/** The breaches of the typed references of the Markdown files `isJudged` chooses. */
function judgeReferences(
  { files, scope, references, sources }: RuleReading,
  isJudged: (path: string) => boolean,
): Breach[] {
  return files
    .listVisible(scope)
    .filter(isJudged)
    .flatMap((path) =>
      listLinkTargets(files.readText(path)).flatMap(({ target, fragment }): Breach[] => {
        if (target === '' || fragment === undefined || fragment === '') return [];
        const resolved = resolveTarget(path, target);
        if (resolved === undefined || resolved.endsWith('.md')) return [];
        if (!reachesReference(references, path, resolved)) return [];
        if (files.describe(resolved) !== 'file' || !files.isShown(resolved)) return [];
        const link = `${target}#${fragment}`;
        const reader = sources.readerOf(resolved);
        if (reader === undefined) {
          const extension = posix.extname(resolved);
          const kind = extension === '' ? 'a file without an extension' : `a ${extension} file`;
          return [
            {
              path,
              message: `links to ${link}, but no source reader reads ${kind}, so the fragment names nothing`,
              remedy: `drop the #${fragment}, or link a file whose symbols a source reader reads (${sources.extensions.join(', ')})`,
            },
          ];
        }
        const declared = reader.declarations(files.readText(resolved));
        return declared.some(({ name }) => name === fragment)
          ? []
          : [{ path, message: `links to ${link}, but ${resolved} declares no ${fragment}` }];
      }),
    );
}

const referencesRemedy =
  'point the #fragment at a symbol the file declares, as Name or Name.member, or drop it';

/**
 * Every relative Markdown link the scope owns whose target is a file other than Markdown, with a
 * `#fragment`, is a typed reference: the fragment names a symbol the file declares, as the
 * source reader of its extension reads it (`render-map.ts#renderRootMap`,
 * `contract.ts#SourceReader.scope`), so the link goes stale loudly when the code renames or
 * removes the symbol. A fragment on a file no reader reads is a breach naming its extension.
 * Links are judged among those the run's reach judges; a missing target is `links.resolve`'s,
 * and a Markdown heading anchor too. Epoch 3, over every `.md` file;
 * {@link judgeTypedDocReferences} judges the documentation by its declared type.
 */
export const judgeDocReferences: Rule = {
  id: 'docs.references',
  since: 3,
  until: 4,
  remedy: referencesRemedy,
  judge: (reading) => judgeReferences(reading, (path) => path.endsWith('.md')),
};

/**
 * {@link judgeDocReferences} over the Markdown whose declared type the documentation rules
 * judge, so product documentation names no symbol it must keep true.
 */
export const judgeTypedDocReferences: Rule = {
  id: 'docs.references',
  since: 4,
  remedy: referencesRemedy,
  judge: (reading) => judgeReferences(reading, (path) => isTypedDocumentation(reading.files, path)),
};

/** The breaches of the unlinked symbol spans of the documentation `selection` chooses. */
function judgeSpans({ files, scope }: RuleReading, selection: DocSelection): Breach[] {
  return files
    .listVisible(scope)
    .filter((path) => selectsDocumentation(files, path, selection))
    .flatMap((path) =>
      [
        ...new Set(
          listUnlinkedCode(files.readText(path)).flatMap((span) => readSymbolSpan(span) ?? []),
        ),
      ].map((symbol): Breach => ({
        path,
        message: `names the symbol ${symbol} without linking it`,
      })),
    );
}

const spansRemedy =
  'link it to the file that declares it, as [`name`](path#name), or drop the backticks if no file of this repository declares it';

/**
 * Every inline code span in the documentation the scope owns (see `isDocumentation`) that names
 * a code symbol (see `readSymbolSpan`) is the text of a link, the typed reference
 * `docs.references` resolves; one outside a link would go stale silently. Paths are
 * `docs.paths`', commands `docs.commands`'. Epoch 3; {@link judgeTypedDocSpans} chooses the
 * documentation by its declared type.
 */
export const judgeDocSpans: Rule = {
  id: 'docs.spans',
  since: 3,
  until: 4,
  remedy: spansRemedy,
  judge: (reading) => judgeSpans(reading, 'path'),
};

/** {@link judgeDocSpans} over the Markdown whose declared type the documentation rules judge. */
export const judgeTypedDocSpans: Rule = {
  id: 'docs.spans',
  since: 4,
  remedy: spansRemedy,
  judge: (reading) => judgeSpans(reading, 'type'),
};

/** The target of each inline link tag of a doc comment: `@link`, `@linkcode` or `@linkplain`. */
function listInlineLinks(text: string): string[] {
  return [...text.matchAll(/\{@link(?:code|plain)?\s+([^\s|}]+)[^}]*\}/gu)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * Every inline link tag (see `listInlineLinks`) in a doc comment of a source file the scope owns
 * that a source reader reads names something in the file's scope (see `SourceReader.scope`):
 * the name itself, or `name.member` and `name#member` of one, so the link goes stale loudly when
 * the name is renamed or removed. A URL is not judged. The scope is read only of a file whose
 * comments hold a link.
 */
export const judgeDocLinks: Rule = {
  id: 'docs.comment-links',
  since: 3,
  remedy: 'link a name the file declares or imports, importing it if need be, or drop the {@link}',
  judge(reading) {
    const { files, sources } = reading;
    return listDocComments(reading).flatMap(({ path, text, at }) => {
      const links = listInlineLinks(text);
      const reader = sources.readerOf(path);
      if (links.length === 0 || reader === undefined) return [];
      const scope = reader.scope(files.readText(path));
      return links.flatMap((target): Breach[] => {
        if (/^[A-Za-z][\w+.-]*:/u.test(target)) return [];
        const head = target.split(/[.#]/u)[0] ?? '';
        return scope.has(head)
          ? []
          : [{ path, message: `${at}links {@link ${target}}, but ${head} is not in scope` }];
      });
    });
  },
};
