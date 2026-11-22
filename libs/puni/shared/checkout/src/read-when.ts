import { countWords } from './word-count';

/** The most words a project's `readWhen` or a page's `read-when` may hold. */
export const readWhenWordBudget = 20;

/**
 * Why `text` cannot complete "Read this when …", or `undefined` when it can: it must start with a
 * lower-case letter, end without a full stop, stay on one line and hold at most
 * {@link readWhenWordBudget} words.
 */
export function judgeReadWhen(text: string): string | undefined {
  if (!/^\p{Ll}/u.test(text)) return 'must start with a lower-case letter';
  if (text.endsWith('.')) return 'must not end with a full stop';
  if (/[\r\n]/u.test(text)) return 'must be one line';
  const words = countWords(text);
  if (words > readWhenWordBudget) {
    return `has ${String(words)} words; at most ${String(readWhenWordBudget)}`;
  }
  return undefined;
}
