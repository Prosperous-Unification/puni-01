/** Whitespace-separated tokens of `text`: the unit of every word budget. */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((word) => word !== '').length;
}
