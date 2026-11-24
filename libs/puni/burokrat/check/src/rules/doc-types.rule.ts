import {
  docTypeKey,
  type DocTypeName,
  docTypeNames,
  docTypes,
  docTypesEpoch,
  isMarkdown,
  listPlacedTypes,
  readDocType,
  type RepositoryType,
} from '@puni/shared-checkout';
import type { Breach, Rule } from '../finding';

/** How to declare a type: the front matter that opens the file, or the line added to it. */
const declaring = `front matter declaring it: a --- line, "${docTypeKey}: <type>", a --- line (or that line first in the front matter it has)`;

/** Where each type lives, for a file that may be none of them where it is. */
const everyPlace = docTypeNames.map((name) => `${name} ${docTypes[name].lives}`).join('; ');

/**
 * What to do about a file at `path` of a `repository` that declares no type, a value that is no
 * type, or the type `misplaced` where it does not live.
 */
function remedyAt(
  path: string,
  repository: RepositoryType,
  problem: 'undeclared' | 'unknown' | { readonly misplaced: DocTypeName },
): string {
  const placed = listPlacedTypes(path, repository);
  if (placed.length === 0 && typeof problem === 'object') {
    const { lives } = docTypes[problem.misplaced];
    return `move or rename it to where ${problem.misplaced} lives: ${lives}`;
  }
  if (placed.length === 0) return `move or rename it to where its type lives: ${everyPlace}`;
  const here = placed.join(' or ');
  if (problem === 'undeclared') return `open it with ${declaring}, the type here being ${here}`;
  if (problem === 'unknown') return `declare ${here}, the type that lives here`;
  return `declare ${here}, the type that lives here, or move it to where ${problem.misplaced} lives`;
}

/** Whether `docs.type` leaves the file at `path` of a `repository` unjudged: the records' dash directory. */
function isUninspected(path: string, repository: RepositoryType): boolean {
  return repository === 'system-records' && path.startsWith('dash/');
}

/**
 * Every visible Markdown file the scope owns of a `repository` declares, as `puni-doc-type` in
 * its front matter, one of the `docTypes`, and lies where that type lives. A symlink is judged
 * at its target, which is listed itself. Two absences are expected: a record filed before records
 * declared their type is a record by its place, so a kind directory's file declaring none is
 * none of this rule's; and the records' dash directory, which the records layout does not inspect, is not
 * judged either.
 */
export function judgeDocTypesOf(repository: RepositoryType): Rule {
  return {
    id: 'docs.type',
    since: docTypesEpoch,
    remedy: `give the file ${declaring}`,
    judge: ({ files, scope }) =>
      files
        .listVisible(scope)
        .filter((path) => isMarkdown(path) && !isUninspected(path, repository))
        .flatMap((path): Breach[] => {
          const declared = readDocType(files.readText(path));
          switch (declared.kind) {
            case 'undeclared':
              if (listPlacedTypes(path, repository).includes('record')) return [];
              return [
                {
                  path,
                  message: `declares no ${docTypeKey} in its front matter`,
                  remedy: remedyAt(path, repository, 'undeclared'),
                },
              ];
            case 'unknown':
              return [
                {
                  path,
                  message: `declares ${docTypeKey} ${JSON.stringify(declared.value)}, which is no type; the types are ${docTypeNames.join(', ')}`,
                  remedy: remedyAt(path, repository, 'unknown'),
                },
              ];
            case 'declared': {
              const type = docTypes[declared.type];
              if (type.isPlaced(path, repository)) return [];
              return [
                {
                  path,
                  message: `declares ${docTypeKey} ${declared.type}, which lives ${type.lives}`,
                  remedy: remedyAt(path, repository, { misplaced: declared.type }),
                },
              ];
            }
          }
        }),
  };
}

/** {@link judgeDocTypesOf} a system-state repository. */
export const judgeStateDocTypes = judgeDocTypesOf('system-state');

/** {@link judgeDocTypesOf} a system-records repository. */
export const judgeRecordsDocTypes = judgeDocTypesOf('system-records');
