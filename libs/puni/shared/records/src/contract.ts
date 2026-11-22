import type { CheckoutFiles, FrontMatter } from '@puni/shared-checkout';
import type { RecordKind } from './records-schema';

/** A regular file directly inside a kind directory, by repository path, with the kind it holds. */
export interface RecordFile {
  readonly path: string;
  readonly kind: RecordKind;
}

/** The record files of a checkout, sorted by path, or why git listed none. */
export type RecordListing =
  { readonly records: readonly RecordFile[] } | { readonly failure: string };

/** The records of a records repository. */
export interface RecordsCatalog {
  /** Every visible record file of `files`; a tracked record deleted from the working tree is none. */
  list(files: CheckoutFiles): RecordListing;
  /** The parsed front matter of the record at `path`. */
  readFrontMatter(files: CheckoutFiles, path: string): FrontMatter;
}

/** What the records module exports. */
export interface RecordsExports {
  readonly recordsCatalog: RecordsCatalog;
}
