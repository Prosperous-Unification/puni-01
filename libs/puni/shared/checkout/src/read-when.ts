import { countWords } from './word-count';

/** The most words a project's `readWhen` or a page's `read-when` may hold. */
export const readWhenWordBudget = 20;

/**
 * Every reason `text` cannot complete "Read this when …", joined by commas, or `undefined` when
 * it can: it must start with a lower-case letter, end without a full stop, stay on one line and
 * hold at most {@link readWhenWordBudget} words.
 */
export function judgeReadWhen(text: string): string | undefined {
  const problems: string[] = [];
  if (!/^\p{Ll}/u.test(text)) problems.push('must start with a lower-case letter');
  if (text.endsWith('.')) problems.push('must not end with a full stop');
  if (/[\r\n]/u.test(text)) problems.push('must be one line');
  const words = countWords(text);
  if (words > readWhenWordBudget) {
    problems.push(`has ${String(words)} words; at most ${String(readWhenWordBudget)}`);
  }
  return problems.length === 0 ? undefined : problems.join(', ');
}
