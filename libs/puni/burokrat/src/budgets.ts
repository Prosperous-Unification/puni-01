/** The most whitespace-separated words `AGENTS.md` may hold. */
export const agentsWordBudget = 250;

/** The most whitespace-separated words `README.md` may hold. */
export const readmeWordBudget = 150;

/** The most whitespace-separated words the generated `wiki/index/index.md` may hold. */
export const indexWordBudget = 400;

/** The most words a project's `readWhen` or a page's `read-when` may hold. */
export const readWhenWordBudget = 20;

/** Whitespace-separated tokens of `text`: the unit of every budget above. */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((word) => word !== '').length;
}
