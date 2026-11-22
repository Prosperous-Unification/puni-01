/**
 * One sample of each credential shape, built when the tests run so that no file of this
 * repository holds one and its own `secrets.plaintext` scan stays clean.
 */
export const credentialSamples: readonly (readonly [string, string])[] = [
  ['a private key block', ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' ')],
  ['an AWS access key id', `key ${['AK', 'IA'].join('')}${'Q7'.repeat(8)}`],
  ['a GitHub token', `${['gh', 'p_'].join('')}${'a1B2'.repeat(9)}`],
  ['an sk- token', `export KEY=${['s', 'k-'].join('')}${'x9'.repeat(12)}`],
  ['a Slack token', `${['xo', 'xb-'].join('')}${'1234-'.repeat(3)}abc`],
  ['a credential assigned a literal', `${['pass', 'word'].join('')} = "${'hunter2'.repeat(3)}"`],
  ['a credential assigned a literal', `GITHUB_${['TOK', 'EN'].join('')}=${'Zq3'.repeat(6)}`],
  ['a credential assigned a literal', `"api${['Ke', 'y'].join('')}": "${'v4lue'.repeat(4)}"`],
];

/** Text near the credential shapes that is no credential. */
export const credentialLookalikes: readonly string[] = [
  `const ${['tok', 'en'].join('')} = readTokenFromEnvironment();`,
  `${['tok', 'en'].join('')}: 'short-value',`,
  `${['pass', 'word'].join('')} = process.env.SERVICE_PASSWORD_VALUE;`,
  '-----BEGIN PUBLIC KEY-----',
  'sk-short',
];
