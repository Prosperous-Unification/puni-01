import { breachListing, type Rule } from '../finding';

const credentialKey = String.raw`\b[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key)["']?`;
const longValue = '16,';

/**
 * Text shaped like a credential, by what it looks like: a private key block, an AWS access key
 * id, a GitHub token, an `sk-` or Slack token, or a password, secret, token or API key assigned
 * a literal of 16 or more characters (quoted after `=` or `:`, or bare after `=` up to the end of
 * the word).
 */
export const credentialShapes: readonly (readonly [string, RegExp])[] = [
  ['a private key block', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/u],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/u],
  ['an sk- token', /\bsk-[A-Za-z0-9_-]{20,}/u],
  ['a Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/u],
  [
    'a credential assigned a literal',
    new RegExp(
      `${credentialKey}\\s*(?:[=:]\\s*(?:"[^"\\s]{${longValue}}"|'[^'\\s]{${longValue}}')|=\\s*[A-Za-z0-9+/_-]{${longValue}}(?=\\s|$))`,
      'iu',
    ),
  ],
];

/**
 * No visible file the scope owns holds text shaped like a credential, by
 * {@link credentialShapes}; a file holding a NUL byte is binary and not read as text. The finding
 * names the line and the shape, never the text.
 */
export const forbidPlaintextSecrets: Rule = {
  id: 'secrets.plaintext',
  remedy:
    'remove the credential from the file, rotate it, and read it from the environment or a secret store',
  judge({ files, scope }) {
    const listing = files.listVisible(scope);
    if ('failure' in listing) return breachListing(listing.failure);
    return listing.files.flatMap((path) => {
      const text = files.readText(path);
      if (text.includes('\0')) return [];
      return text.split('\n').flatMap((line, index) =>
        credentialShapes
          .filter(([, shape]) => shape.test(line))
          .map(([shape]) => ({
            path,
            message: `line ${String(index + 1)} holds what looks like ${shape}`,
          })),
      );
    });
  },
};
