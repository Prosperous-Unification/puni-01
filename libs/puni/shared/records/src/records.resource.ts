import { posix } from 'node:path';
import { parseFrontMatter, repositoryScope } from '@puni/shared-checkout';
import type { RecordsCatalog } from './contract';
import { recordDirectories, recordKinds } from './records-schema';

/** The {@link RecordsCatalog}. */
export function createRecordsCatalog(): RecordsCatalog {
  return {
    list(files) {
      const listing = files.listVisible(repositoryScope);
      if ('failure' in listing) return listing;
      return {
        records: listing.files.flatMap((path) => {
          const kind = recordKinds.find(
            (candidate) => posix.dirname(path) === recordDirectories[candidate],
          );
          return kind === undefined ? [] : [{ path, kind }];
        }),
      };
    },
    readFrontMatter: (files, path) => parseFrontMatter(files.readText(path)),
  };
}
