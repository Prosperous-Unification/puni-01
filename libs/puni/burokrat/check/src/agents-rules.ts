/**
 * The digest of this repository's `AGENTS.md` rules section, by {@link digestRulesSection}. Only
 * the owner, the person agents work for, changes it, and only when the owner has changed the
 * rules: `agents.rules` prints the digest to set here.
 */
export const agentsRulesDigest = '3770cefd54ff429b';

const fnvOffset = 0xcbf29ce484222325n;
const fnvPrime = 0x100000001b3n;
const sixtyFourBits = (1n << 64n) - 1n;

/**
 * The `## Rules` section of the Markdown `text`: from its `## Rules` heading line to the next
 * `## ` heading or the end, or `undefined` when no line is that heading.
 */
export function readRulesSection(text: string): string | undefined {
  const heading = /^## Rules[ \t]*$/mu.exec(text);
  if (heading === null) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^## /mu.exec(rest);
  return text.slice(
    heading.index,
    heading.index + heading[0].length + (next?.index ?? rest.length),
  );
}

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
