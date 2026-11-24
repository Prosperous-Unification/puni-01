/** A look of a credential: the name a finding gives it, and the pattern its text has on one line. */
export interface CredentialShape {
  readonly name: string;
  readonly pattern: RegExp;
}

/** A key naming a password, secret, token or API key, optionally closing a quote. */
const credentialKey = String.raw`\b[A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key)["']?`;

/** A literal long enough to be a credential, not a word or a placeholder. */
const longValue = '16,';

/**
 * Text shaped like a credential wherever it appears: a private key block, an AWS access key id,
 * a GitHub token, an `sk-` or Slack token, a bearer token, a URL whose user-info holds a
 * password, a JSON web token, a Google API key, an age secret key, a WBS API key (`wbs_mk_`, a
 * UUID, `.`, then 43 base64url characters), or a password, secret, token or API key assigned
 * a literal of 16 or more characters (quoted after `=` or `:`, or bare after `=` up to the end of
 * the word). Placeholders (`$NAME`, `<name>`, `${{ … }}`) are no credential.
 */
export const credentialShapes: readonly CredentialShape[] = [
  {
    name: 'a private key block',
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/u,
  },
  { name: 'an AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
  {
    name: 'a GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/u,
  },
  { name: 'an sk- token', pattern: /\bsk-[A-Za-z0-9_-]{20,}/u },
  { name: 'a Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/u },
  { name: 'a bearer token', pattern: /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/iu },
  {
    name: 'a URL holding a password',
    pattern: /\b[A-Za-z][\w+.-]*:\/\/[^\s:/@]+:[^\s/@$<>{}]+@[^\s/@]/u,
  },
  {
    name: 'a JSON web token',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u,
  },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}/u },
  { name: 'an age secret key', pattern: /\bAGE-SECRET-KEY-1[0-9A-Z]{58}/u },
  {
    name: 'a WBS API key',
    pattern:
      /\bwbs_mk_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}/u,
  },
  {
    name: 'a credential assigned a literal',
    pattern: new RegExp(
      `${credentialKey}\\s*(?:[=:]\\s*(?:"[^"\\s]{${longValue}}"|'[^'\\s]{${longValue}}')|=\\s*[A-Za-z0-9+/_-]{${longValue}}(?=\\s|$))`,
      'iu',
    ),
  },
];

/**
 * A credential a configuration file assigns: a key naming a password, secret, token or API key,
 * `=` or `:`, then a value of 16 or more characters, quoted or bare, that is no placeholder.
 */
export const configuredCredential: CredentialShape = {
  name: 'a credential assigned in configuration',
  pattern: new RegExp(`${credentialKey}\\s*[=:]\\s*["']?[^\\s"'$<{#,][^\\s"'#,]{15,}`, 'iu'),
};
