import type { ReviewCriterion } from './review-record';
import type {
  CheckoutFiles,
  CheckoutFilesResource,
  FrontMatter,
  RecordKind,
  RepositoryRegistryResource,
} from '@puni/shared-checkout';
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
  /** Markdown body supplied directly. */
  readonly body?: string | undefined;
  /**
   * The absolute path of the file holding the body; without one the body is `# <title>`, then a
   * `## <heading>` for each of `sections`, each section empty.
   */
  readonly bodyFile?: string | undefined;
  /** The headings of the empty sections a body made without a body file holds. */
  readonly sections?: readonly string[] | undefined;
  /**
   * The repository-relative path of a record this one replaces. The new record names it in
   * `supersedes` and it gains `superseded-by` naming the new record, its other bytes kept.
   */
  readonly supersedes?: string | undefined;
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
   * @throws RecordBodyRefused when a structured review's body is invalid, or both body sources are supplied.
   * @throws RecordValueRefused naming the key and its expected form when a value is refused.
   * @throws RecordTitleUnsluggable when the title has no letter or digit.
   * @throws RecordExists when the file already exists.
   * @throws SupersededRecordRefused when `supersedes` names no record file directly inside a kind
   *   directory, one whose front matter does not parse, or one already superseded; nothing is
   *   written.
   * @throws BodyFileMissing when `bodyFile` names nothing.
   * @throws FileUnreadable when `bodyFile` exists but cannot be read.
   */
  file(files: CheckoutFiles, draft: RecordDraft): string;
}

/** A parsed `<group> add` request filing one record: its title, topics, summary and body file. */
export interface RecordAddRequest<Kind extends string> {
  readonly kind: Kind;
  readonly title: string;
  /** Comma-separated topics. */
  readonly topics: string;
  readonly summary: string;
  /** The file holding the body, relative to the directory the command started from. */
  readonly bodyFile?: string | undefined;
  /** The repository-relative path of the record the new one replaces. */
  readonly supersedes?: string | undefined;
}

/** What a new record is, apart from what the command line gives it. */
export interface RecordShape {
  readonly kind: RecordKind;
  /** The headings of the empty sections its body holds when no body file is given. */
  readonly sections: readonly string[];
}

/**
 * What filing a record did: the record's path relative to the records checkout, a `refused`
 * command line, or a `defective` repository, each with its one-line reason.
 */
export type RecordFilingOutcome =
  | { readonly kind: 'filed'; readonly path: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'defective'; readonly reason: string };

/** The capability "file a record". */
export interface RecordFiling {
  /**
   * Files a record of `shape` that `request` describes in the records repository found from
   * `cwd`.
   */
  file(cwd: string, shape: RecordShape, request: RecordAddRequest<string>): RecordFilingOutcome;
}

/** What the records module needs from its host. */
export interface RecordsRequirements {
  readonly clock: Clock;
  readonly fileSystem: FileSystem;
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
}

/** What the records module exports. */
export interface RecordsExports {
  readonly recordsCatalog: RecordsCatalog;
  readonly recordFiling: RecordFiling;
  readonly reviewTemplates: ReviewTemplates;
}

/** An exact criteria-map version. */
export interface ReviewTemplateReference {
  readonly id: string;
  readonly version: string;
}

/** A versioned map whose criterion IDs are stable within that version. */
export interface ReviewTemplate extends ReviewTemplateReference {
  readonly criteria: readonly ReviewCriterion[];
}

/** The criteria maps shipped by PUNI and those in a governed repository. */
export interface ReviewTemplates {
  /** Lists available template versions, sorted by ID then numeric version. */
  list(root: string): readonly ReviewTemplateReference[];
  /** Loads a named version, or the highest version of an ID when omitted. */
  load(root: string, id: string, version?: string): ReviewTemplate;
}
