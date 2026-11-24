import type { CheckoutFilesResource, RepositoryRegistryResource } from '@puni/shared-checkout';
import type { Command } from '@puni/shared-command';
import type {
  RecordsCatalog,
  ReviewCandidate,
  ReviewCriterion,
  ReviewRecord,
  ReviewTemplates,
} from '@puni/shared-records';

/** Request and destination journal of a new review. */
export interface StartRequest {
  readonly kind: 'review start';
  readonly request: string;
  readonly state: string;
}

/** Read the current review task. */
export interface NextRequest {
  readonly kind: 'review next';
  readonly state: string;
}

/** A structured response to the current review task. */
export interface SubmitRequest {
  readonly kind: 'review submit';
  readonly state: string;
  readonly responseFile: string;
}

/** Metadata for a completed review to be filed. */
export interface FileRequest {
  readonly kind: 'review file';
  readonly state: string;
  readonly title: string;
  readonly topics: string;
  readonly summary: string;
}

/** The frozen source and instructions passed to assessors. */
export interface ReviewInput {
  readonly root: string;
  readonly commit: string;
  readonly snapshot?: string;
  readonly subject: string;
  readonly instruction: string;
  readonly criteria: readonly ReviewCriterion[];
  readonly template?: NonNullable<ReviewRecord['template']>;
  readonly model?: string;
  readonly effort?: string;
  readonly maxRuns: number;
}

/** An accepted finding before scoring. IDs are assigned in discovery order. */
export interface PooledFinding extends ReviewCandidate {
  readonly id: string;
}

/** The tasks returned by the CLI for a skill to execute, or the completed review. */
export type ReviewTask =
  | (ReviewInput & { readonly kind: 'discover'; readonly run: number })
  | (ReviewInput & {
      readonly kind: 'compare';
      readonly run: number;
      readonly candidates: readonly ReviewCandidate[];
      readonly pool: readonly PooledFinding[];
    })
  | (ReviewInput & { readonly kind: 'score'; readonly findings: readonly PooledFinding[] })
  | (ReviewRecord & { readonly kind: 'complete' });

/** The persisted review progress while it is replayed. */
export interface ReviewProgress {
  readonly task: ReviewTask;
  readonly runs: readonly number[];
}

/** Review operations the command handlers can call. */
export interface ReviewWorkflow {
  /** Starts a review and returns the first task. */
  start(cwd: string, request: StartRequest): ReviewTask;
  /** Reads the current task without advancing the review. */
  next(cwd: string, request: NextRequest): ReviewTask;
  /** Accepts a response and returns the next task. */
  submit(cwd: string, request: SubmitRequest): ReviewTask;
  /** Files the completed review and returns the saved path and ranked findings. */
  file(
    cwd: string,
    request: FileRequest,
  ): { readonly path: string; readonly findings: ReviewRecord['findings'] };
}

/** The journal stores validated events with create-only writes. */
export interface ReviewJournal {
  /** Reads JSON for an input or response. */
  readInput(path: string): unknown;
  /** Creates a new journal at path. */
  create(path: string, input: ReviewInput): void;
  /** Reads the root task and the sequentially committed results. */
  read(path: string): { readonly input: ReviewInput; readonly results: readonly unknown[] };
  /** Appends one result at its expected index, failing on competing writes. */
  append(path: string, index: number, response: unknown): void;
}

/** Source capture and checking for stable review inputs. */
export interface ReviewSource {
  /** Returns the pinned commit, and the working-tree digest when requested. */
  capture(root: string, workingTree: boolean): Pick<ReviewInput, 'commit' | 'snapshot'>;
  /** Verifies a requested working tree still agrees with its pinned digest. */
  verify(input: ReviewInput): void;
}

/** The checkout and records capabilities a review needs. */
export interface ReviewRequirements {
  readonly checkoutRegistry: RepositoryRegistryResource;
  readonly checkoutFiles: CheckoutFilesResource;
  readonly recordsCatalog: RecordsCatalog;
  readonly reviewTemplates: ReviewTemplates;
}

/** Command handlers exported by this group. */
export interface ReviewExports {
  readonly burokratReviewStartCommand: Command<StartRequest>;
  readonly burokratReviewNextCommand: Command<NextRequest>;
  readonly burokratReviewSubmitCommand: Command<SubmitRequest>;
  readonly burokratReviewFileCommand: Command<FileRequest>;
}
