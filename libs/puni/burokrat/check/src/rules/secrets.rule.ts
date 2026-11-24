import { posix } from 'node:path';
import type { CheckoutFiles, CheckScope } from '@puni/shared-checkout';
import { configuredCredential, credentialShapes } from '@puni/shared-failures';
import type { Breach, Rule } from '../finding';

/** The extensions of the configuration files `configuredCredential` is judged in. */
const configurationExtensions: readonly string[] = [
  '.yml',
  '.yaml',
  '.env',
  '.toml',
  '.json',
  '.ini',
];

/** Whether the file at `path` is configuration: one of those extensions, or a `.env.<name>`. */
function isConfiguration(path: string): boolean {
  const name = posix.basename(path);
  return (
    configurationExtensions.includes(posix.extname(name)) ||
    name === '.env' ||
    name.startsWith('.env.')
  );
}

/** The entry whose lines are the paths of the visible files a scope owns, one per line. */
const pathsEntry = '(paths)';

/** A byte order mark read as UTF-8: two replacement characters. */
const byteOrderMark = /^\uFFFD\uFFFD/u;

/**
 * `line` as text to judge. A line without NUL is itself. A line of UTF-16 text, a NUL at every
 * other place (after the byte order mark a first line starts with), as UTF-8 reads it, is decoded
 * by dropping the NULs; that keeps every ASCII character, the only ones a credential shape or an
 * address holds. Any other line holding a NUL is binary: `undefined`.
 */
function decodeLine(line: string): string | undefined {
  if (!line.includes('\0')) return line;
  const body = line.replace(byteOrderMark, '');
  for (const nulParity of [0, 1]) {
    let decoded = '';
    let index = 0;
    for (; index < body.length; index += 1) {
      const isNul = body.charCodeAt(index) === 0;
      if (isNul !== (index % 2 === nulParity)) break;
      if (!isNul) decoded += body.charAt(index);
    }
    if (index === body.length) return decoded;
  }
  return undefined;
}

/**
 * Each visible file the scope owns, as its path and lines, each line decoded by `decodeLine`
 * and a binary one left empty; then {@link pathsEntry}, whose lines are those paths, so that a
 * file name is judged as its text is without a finding printing it.
 */
function listTextLines(
  files: CheckoutFiles,
  scope: CheckScope,
): { readonly path: string; readonly lines: readonly string[] }[] {
  const paths = files.listVisible(scope);
  const texts = paths.map((path) => ({
    path,
    lines: files
      .readText(path)
      .split('\n')
      .map((line) => decodeLine(line) ?? ''),
  }));
  return paths.length === 0 ? texts : [...texts, { path: pathsEntry, lines: [...paths] }];
}

/**
 * No visible file the scope owns, read as `listTextLines` reads it, nor a path of one, holds
 * text shaped like a credential, by
 * `credentialShapes` of `@puni/shared-failures`, nor a configuration file (`.yml`, `.yaml`,
 * `.env`, `.toml`, `.json`, `.ini`, `.env.<name>`) a credential assigned a bare value, by
 * `configuredCredential`. The finding names the line and the shape, never the text.
 */
export const forbidPlaintextSecrets: Rule = {
  id: 'secrets.plaintext',
  since: 1,
  remedy:
    'remove the credential from the file, rotate it, and read it from the environment or a secret store',
  judge({ files, scope }) {
    return listTextLines(files, scope).flatMap(({ path, lines }) => {
      const configuration = isConfiguration(path);
      return lines.flatMap((line, index) => {
        const matched = credentialShapes.filter(({ pattern }) => pattern.test(line));
        if (matched.length === 0 && configuration && configuredCredential.pattern.test(line)) {
          matched.push(configuredCredential);
        }
        return matched.map(({ name }) => ({
          path,
          message: `line ${String(index + 1)} holds what looks like ${name}`,
        }));
      });
    });
  },
};

/** The documentation ranges of RFC 5737, as the first three numbers of their addresses. */
const documentationRanges: readonly string[] = ['192.0.2', '198.51.100', '203.0.113'];

/** Whether an address may be written down: loopback, `0.0.0.0`, broadcast or documentation. */
function isAllowedAddress(octets: readonly number[]): boolean {
  const address = octets.join('.');
  return (
    octets[0] === 127 ||
    address === '0.0.0.0' ||
    address === '255.255.255.255' ||
    documentationRanges.includes(octets.slice(0, 3).join('.'))
  );
}

/** Four dotted numbers, not inside a longer dotted run or a word. */
const dottedQuad = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\w|\.\d)/gu;

/** Whether `line` holds an IPv4 address literal that may not be written down. */
function holdsAddress(line: string): boolean {
  return [...line.matchAll(dottedQuad)].some((match) => {
    const octets = match.slice(1, 5).map(Number);
    return octets.every((octet) => octet <= 255) && !isAllowedAddress(octets);
  });
}

/**
 * No visible file the scope owns, read as `listTextLines` reads it, nor a path of one, holds an
 * IPv4 address literal, except loopback (`127.0.0.0/8`), `0.0.0.0`, `255.255.255.255` and the
 * documentation ranges `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`. The
 * finding names the line, never the address. `remedy` says where the address belongs instead.
 */
function forbidAddresses(remedy: string): Rule {
  return {
    id: 'secrets.addresses',
    since: 1,
    remedy,
    judge({ files, scope }) {
      return listTextLines(files, scope).flatMap(({ path, lines }) =>
        lines.flatMap((line, index): Breach[] =>
          holdsAddress(line)
            ? [{ path, message: `line ${String(index + 1)} holds an IPv4 address` }]
            : [],
        ),
      );
    },
  };
}

/** No address in a system-state repository, by `forbidAddresses`. */
export const forbidStateAddresses = forbidAddresses(
  "move the address to the operator's SSH configuration or the records repository and name the host by its SSH alias; a test uses 192.0.2.0/24",
);

/**
 * No address in a records repository, by `forbidAddresses`: the operator's SSH configuration is
 * the one place left for it.
 */
export const forbidRecordsAddresses = forbidAddresses(
  "move the address to the operator's SSH configuration and name the host by its SSH alias",
);
