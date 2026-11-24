/** A UUID of the shape a WBS API key carries. */
const wbsKeyId = '1234abcd-12ab-34cd-56ef-1234567890ab';

/** The prefixes of an age secret key and a WBS API key, built so that no file holds them. */
const agePrefix = `${['AGE', 'SECRET', 'KEY'].join('-')}-1`;
const wbsPrefix = `${['wbs', 'mk'].join('_')}_`;

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
  ['a bearer token', `Authorization: ${['Bear', 'er'].join('')} ${'Tk9'.repeat(8)}`],
  ['a URL holding a password', `postgres://app:${'Pw4'.repeat(4)}@db.internal/app`],
  [
    'a JSON web token',
    [['ey', 'J'].join('') + 'hbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjMifQ', 'c2lnbmF0dXJlLXg'].join('.'),
  ],
  ['a Google API key', `${['AI', 'za'].join('')}${'Sy7'.repeat(11)}Qx`],
  ['an age secret key', `# key: ${agePrefix}${'QZ7'.repeat(19)}X`],
  ['a WBS API key', `WBS_KEY ${wbsPrefix}${wbsKeyId}.${'aB3_-'.repeat(8)}abc`],
  ['a credential assigned a literal', `${['pass', 'word'].join('')} = "${'hunter2'.repeat(3)}"`],
  ['a credential assigned a literal', `GITHUB_${['TOK', 'EN'].join('')}=${'Zq3'.repeat(6)}`],
  ['a credential assigned a literal', `"api${['Ke', 'y'].join('')}": "${'v4lue'.repeat(4)}"`],
];

/**
 * Configuration lines assigning a credential a bare value, each in a file of its name, which only
 * configuration files are judged for.
 */
export const configuredSamples: readonly (readonly [string, string])[] = [
  ['config.yml', `${['tok', 'en'].join('')}: ${'Ab3'.repeat(10)}`],
  ['settings.yaml', `  db_${['pass', 'word'].join('')}: ${'S3cr'.repeat(5)}`],
  ['.env', `API_${['KE', 'Y'].join('')}=${'k9.'.repeat(8)}`],
  ['app.toml', `client_${['sec', 'ret'].join('')} = ${'x7~'.repeat(7)}`],
  ['service.ini', `${['pass', 'wd'].join('')} = ${'Lm8!'.repeat(5)}`],
  ['.env.local', `SESSION_${['SEC', 'RET'].join('')}: ${'zZ9'.repeat(6)}`],
];

/** Text near the credential shapes that is no credential. */
export const credentialLookalikes: readonly string[] = [
  `const ${['tok', 'en'].join('')} = readTokenFromEnvironment();`,
  `${['tok', 'en'].join('')}: 'short-value',`,
  `${['pass', 'word'].join('')} = process.env.SERVICE_PASSWORD_VALUE;`,
  '-----BEGIN PUBLIC KEY-----',
  'sk-short',
  `Authorization: ${['Bear', 'er'].join('')} $TOKEN`,
  `send a ${['bear', 'er'].join('')} token in the header`,
  'https://user@example.com/repository',
  'postgres://app:${DB_PASSWORD}@db/app',
  'http://localhost:8080/a@b',
  `${['ey', 'J'].join('')}hbGciOiJIUzI1NiJ9.only-two`,
  `${['AI', 'za'].join('')}TooShort`,
  `${agePrefix}${'QZ7'.repeat(19)}`,
  `${wbsPrefix}${wbsKeyId}.${'aB3_-'.repeat(8)}ab`,
];

/** Configuration lines near {@link configuredSamples} that hold no credential. */
export const configuredLookalikes: readonly string[] = [
  `${['tok', 'en'].join('')}: \${{ secrets.GITHUB_TOKEN }}`,
  `${['pass', 'word'].join('')}_file: /run/secrets/database-password`,
  `${['tok', 'en'].join('')}: short`,
  `${['sec', 'ret'].join('')}: <the secret from the store>`,
  'tokenizer: whitespace-and-punctuation',
];

/** An IPv4 address no file may hold, built when the tests run. */
export const forbiddenAddress = [10, 20, 30, 40].join('.');
