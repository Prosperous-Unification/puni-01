import type { UsageCategory, UsageTokens } from './contract';

/** Every token category, in the order a breakdown lists them. */
export const usageCategories: readonly UsageCategory[] = [
  'input',
  'cacheWrite',
  'cacheWriteExtended',
  'cacheRead',
  'output',
];

/** No tokens in any category. */
export const noTokens: UsageTokens = {
  input: 0,
  cacheWrite: 0,
  cacheWriteExtended: 0,
  cacheRead: 0,
  output: 0,
};

/** The sum of `left` and `right`, category by category. */
export function addTokens(left: UsageTokens, right: UsageTokens): UsageTokens {
  return {
    input: left.input + right.input,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    cacheWriteExtended: left.cacheWriteExtended + right.cacheWriteExtended,
    cacheRead: left.cacheRead + right.cacheRead,
    output: left.output + right.output,
  };
}

/** Whether `tokens` counts nothing in every category. */
export function isNoUsage(tokens: UsageTokens): boolean {
  return usageCategories.every((category) => tokens[category] === 0);
}
