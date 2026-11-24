export { readRulesSection } from '@puni/shared-checkout';

/**
 * The digest, by {@link digestRulesSection}, of the `AGENTS.md` rules section in force from each
 * rules epoch at which it changed; the one in force at a pin is that of the largest epoch at or
 * below it. Only the owner, the person agents work for, adds one, and only when the owner has
 * changed the rules: under the next epoch, with the digest `agents.rules` prints. This
 * repository's own section is the one in force at its pin.
 */
export const agentsRulesDigests: Readonly<Record<number, string>> = { 1: '3770cefd54ff429b' };

/** The digest of `digests` in force at the rules epoch `pin`, or `undefined` before the first. */
export function rulesDigestAt(
  digests: Readonly<Record<number, string>>,
  pin: number,
): string | undefined {
  const epochs = Object.keys(digests)
    .map(Number)
    .filter((epoch) => epoch <= pin);
  return epochs.length === 0 ? undefined : digests[Math.max(...epochs)];
}

const fnvOffset = 0xcbf29ce484222325n;
const fnvPrime = 0x100000001b3n;
const sixtyFourBits = (1n << 64n) - 1n;

/**
 * The FNV-1a 64-bit digest, as 16 lowercase hex digits, of `section`'s UTF-8 bytes once every run
 * of whitespace is one space and the ends are trimmed, so rewrapping does not change it. It
 * detects edits, not attackers: anyone can craft a different text with the same digest.
 */
export function digestRulesSection(section: string): string {
  const normalised = section.replace(/\s+/gu, ' ').trim();
  let hash = fnvOffset;
  for (const byte of new TextEncoder().encode(normalised)) {
    hash = ((hash ^ BigInt(byte)) * fnvPrime) & sixtyFourBits;
  }
  return hash.toString(16).padStart(16, '0');
}
