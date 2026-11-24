import type { RepositoryRegistryResource } from '@puni/shared-checkout';
import type { ReviewTemplates } from '@puni/shared-records';
import type { Command } from '@puni/shared-command';

/**
 * A parsed `assess outcomes` request: the period as the command line spelled it, the rate card
 * and log directories when given, and whether to print the whole breakdown as JSON.
 */
export interface OutcomesRequest {
  readonly kind: 'assess outcomes';
  readonly since: string;
  readonly until: string;
  readonly rateCard?: string | undefined;
  readonly claudeProjects: readonly string[];
  readonly codexSessions: readonly string[];
  readonly json: boolean;
}

/** A period of time: from `since`, included, to `until`, excluded, both ISO instants in UTC. */
export interface UsagePeriod {
  readonly since: string;
  readonly until: string;
}

/** A token category every harness's usage is counted in; a harness without one leaves it zero. */
export type UsageCategory = 'input' | 'cacheWrite' | 'cacheWriteExtended' | 'cacheRead' | 'output';

/** Token counts by category. */
export type UsageTokens = Readonly<Record<UsageCategory, number>>;

/** The agent harness a usage row was read from. */
export type Harness = 'claude-code' | 'codex';

/** Where a usage row or a skipped line was read: an absolute file path and a 1-based line. */
export interface LogLine {
  readonly path: string;
  readonly line: number;
}

/** One measured unit of consumption: one Claude Code request, or one advance of a Codex count. */
export interface UsageRow {
  readonly harness: Harness;
  readonly sessionId: string;
  readonly model: string;
  /** The ISO instant the harness recorded it at. */
  readonly instant: string;
  /** The branch the session worked on; none when the harness recorded none. */
  readonly branch: string | null;
  readonly tokens: UsageTokens;
  readonly source: LogLine;
}

/** The pull requests of the assessed repository one session's log links to, ascending. */
export interface SessionReferences {
  readonly harness: Harness;
  readonly sessionId: string;
  readonly pullRequests: readonly number[];
}

/** What the harness logs of a period hold. */
export interface HarnessUsage {
  /** The rows recorded in the period, oldest first; rows of only zeros are left out. */
  readonly rows: readonly UsageRow[];
  readonly sessions: readonly SessionReferences[];
  /** Lines that are not JSON, skipped: a live session leaves a line torn while it writes. */
  readonly unreadableLines: readonly LogLine[];
}

/** The directories the harness logs are read from, every one absolute. */
export interface HarnessLogSources {
  readonly claudeProjects: readonly string[];
  readonly codexSessions: readonly string[];
}

/** The prices of one model, in the card's currency per million tokens of each category. */
export interface ModelPrices {
  readonly input: number;
  readonly cacheWrite: number;
  /** The price of an hour-long cache write, where the provider sells one. */
  readonly cacheWriteExtended?: number | undefined;
  readonly cacheRead: number;
  readonly output: number;
}

/** One model's entry of a rate card, with where its prices were read and when. */
export interface RateCardEntry {
  readonly provider: string;
  readonly model: string;
  readonly prices: ModelPrices;
  readonly source: string;
  /** The day the source was read, `YYYY-MM-DD`. */
  readonly accessedAt: string;
}

/** Per-million-token prices by model; each model listed once. */
export interface RateCard {
  readonly currency: string;
  readonly entries: readonly RateCardEntry[];
}

/** A rate card and where it came from: a path, or `shipped` for the card this library ships. */
export interface LoadedRateCard {
  readonly card: RateCard;
  readonly source: string;
}

/** A first-parent merge into `main`: an outcome the repository accepted. */
export interface AcceptedOutcome {
  readonly mergeHash: string;
  /** The ISO instant it was committed. */
  readonly mergedAt: string;
  readonly subject: string;
  /** The pull request and head branch its subject names; none for a merge naming no pull request. */
  readonly pullRequest: number | null;
  readonly headBranch: string | null;
  /** The pull requests and head branches of merges inside it, as of a plan branch's members. */
  readonly nestedPullRequests: readonly number[];
  readonly memberBranches: readonly string[];
}

/** Why a priced row was charged to no outcome. */
export type RemainderReason =
  'ambiguous-references' | 'no-branch' | 'on-default-branch' | 'branch-not-accepted';

/** Why a row could not be priced; it is never priced at a default. */
export type UnpricedReason = 'unknown-model' | 'missing-category';

/** The rows of one harness and model that could not be priced, and why. */
export interface UnpricedUsage {
  readonly harness: Harness;
  readonly model: string;
  readonly reason: UnpricedReason;
  readonly rows: number;
  readonly tokens: UsageTokens;
}

/** The usage of one harness and model; its cost is `null` when any of its rows is unpriced. */
export interface ModelUsage {
  readonly harness: Harness;
  readonly model: string;
  readonly rows: number;
  readonly tokens: UsageTokens;
  readonly micros: number | null;
}

/** One accepted outcome and what was charged to it. */
export interface OutcomeCharge extends AcceptedOutcome {
  readonly micros: number;
  readonly rows: number;
  readonly sessions: readonly string[];
  readonly models: readonly string[];
  /** How many of its rows each attribution rule charged to it. */
  readonly rules: Readonly<Record<'pull-request-reference' | 'branch', number>>;
}

/**
 * What the agent work of a period cost, per accepted outcome. Money is in millionths of the rate
 * card's currency, API-equivalent: what the tokens would cost at the card's prices.
 */
export interface OutcomeBreakdown {
  readonly period: UsagePeriod;
  /** The `<owner>/<name>` of the system-state repository. */
  readonly repository: string;
  readonly rateCard: string;
  readonly currency: string;
  readonly acceptedOutcomes: number;
  readonly pricedMicros: number;
  readonly attributedMicros: number;
  /** The attributed share of the priced cost, four decimals; none when nothing was priced. */
  readonly coverage: number | null;
  /** The priced cost over the accepted outcomes, rounded; none when nothing was accepted. */
  readonly microsPerOutcome: number | null;
  readonly remainderMicros: Readonly<Record<RemainderReason, number>>;
  readonly unpriced: readonly UnpricedUsage[];
  readonly models: readonly ModelUsage[];
  readonly outcomes: readonly OutcomeCharge[];
  readonly rows: number;
  readonly unreadableLines: readonly LogLine[];
}

/** The harness logs of a machine. */
export interface HarnessLogsResource {
  /** Where the logs are when the command line names no directory: below the home directory. */
  readonly defaultSources: HarnessLogSources;
  /**
   * The usage the logs in `sources` recorded in `period`, with the pull requests of
   * `repositorySlug` each session links to.
   *
   * @throws HarnessLogUnreadable when a directory or file cannot be read.
   * @throws HarnessLogMalformed when a JSON line lacks what usage is read from, or contradicts
   *   another line.
   */
  read(sources: HarnessLogSources, period: UsagePeriod, repositorySlug: string): HarnessUsage;
}

/** Rate cards. */
export interface RateCardResource {
  /**
   * The rate card at the absolute `path`, or the shipped one when none is given.
   *
   * @throws RateCardUnreadable when the file cannot be read.
   * @throws RateCardMalformed when it is not JSON or not a rate card.
   */
  load(path: string | undefined): LoadedRateCard;
}

/** The outcomes a repository accepted. */
export interface AcceptedOutcomesResource {
  /**
   * The first-parent merges into `main` committed in `period`, oldest first, in the repository
   * whose worktree is `root`.
   *
   * @throws OutcomesUnreadable when git cannot list them.
   */
  list(root: string, period: UsagePeriod): readonly AcceptedOutcome[];
}

/**
 * What an assessment came to: the breakdown, a `refused` command line, or `failed` inputs, each
 * with its one-line reason.
 */
export type AssessmentOutcome =
  | { readonly kind: 'assessed'; readonly breakdown: OutcomeBreakdown }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

/** The capability "say what the agent work of a period cost per accepted outcome". */
export interface OutcomeAssessment {
  /** Assesses `request` for the system-state repository found from `cwd`. */
  assess(cwd: string, request: OutcomesRequest): AssessmentOutcome;
}

/**
 * What the assess module needs from its host: the registry, and `fileSystem` and `git`, which
 * its resources name in their own requirements because only a resource sees the ports.
 */
export interface AssessRequirements {
  readonly reviewTemplates: ReviewTemplates;
  readonly checkoutRegistry: RepositoryRegistryResource;
}

/** The template list command, optionally printed as JSON. */
export interface TemplatesRequest {
  readonly kind: 'assess templates';
  readonly json: boolean;
}

/** What the assess module exports. */
export interface AssessExports {
  readonly burokratAssessTemplatesCommand: Command<TemplatesRequest>;
  readonly burokratAssessOutcomesCommand: Command<OutcomesRequest>;
}
