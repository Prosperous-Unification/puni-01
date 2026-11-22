import type { CheckoutFiles, FrontMatter } from '@puni/shared-checkout';
import type { RecordKind } from './records-schema';

/** A regular file directly inside a kind directory, by repository path, with the kind it holds. */
export interface RecordFile {
  readonly path: string;
  readonly kind: RecordKind;
}

/** The records of a records repository. */
export interface RecordsCatalog {
  /**
   * Every visible record file of `files`, sorted by path; a tracked record deleted from the
   * working tree is none.
   *
   * @throws CheckoutUnlistable when git cannot list the checkout.
   */
  list(files: CheckoutFiles): readonly RecordFile[];
  /** The parsed front matter of the record at `path`. */
  readFrontMatter(files: CheckoutFiles, path: string): FrontMatter;
}

/** What the records module exports. */
export interface RecordsExports {
  readonly recordsCatalog: RecordsCatalog;
}
