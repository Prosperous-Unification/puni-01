import type { CheckoutFiles, FrontMatter, RecordKind } from '@puni/shared-checkout';
import type { Clock, FileSystem } from '@puni/shared-ports';

/** A regular file directly inside a kind directory, by repository path, with the kind it holds. */
export interface RecordFile {
  readonly path: string;
  readonly kind: RecordKind;
}

/** What a new record holds before it is filed; its date is today's, read from the clock. */
export interface RecordDraft {
  readonly kind: RecordKind;
  readonly title: string;
  /** Comma-separated topics. */
  readonly topics: string;
  readonly summary: string;
  /** The system-state commit the record was written against. */
  readonly commit: string;
  /** The absolute path of the file holding the body; without one the body is `# <title>`. */
  readonly bodyFile?: string | undefined;
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
  /**
   * Files `draft` in the records checkout `files` as `<kind directory>/<UTC date>-<slug>.md` and
   * returns that path; the slug is the trimmed title lower-cased, each run of anything but ASCII
   * letters and digits one hyphen, hyphens trimmed. The file opens with the front matter the
   * records rules require, each value trimmed and judged by them, then the body. Nothing is
   * committed.
   *
   * @throws RecordValueRefused naming the key and its expected form when a value is refused.
   * @throws RecordTitleUnsluggable when the title has no letter or digit.
   * @throws RecordExists when the file already exists.
   * @throws BodyFileMissing when `bodyFile` names nothing.
   * @throws FileUnreadable when `bodyFile` exists but cannot be read.
   */
  file(files: CheckoutFiles, draft: RecordDraft): string;
}

/** What the records module needs from its host. */
export interface RecordsRequirements {
  readonly clock: Clock;
  readonly fileSystem: FileSystem;
}

/** What the records module exports. */
export interface RecordsExports {
  readonly recordsCatalog: RecordsCatalog;
}
