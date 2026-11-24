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

/**
 * Each visible text file the scope owns, as its path and lines; a file holding a NUL byte is
 * binary and left out.
 */
function listTextLines(
  files: CheckoutFiles,
  scope: CheckScope,
): { readonly path: string; readonly lines: readonly string[] }[] {
  return files.listVisible(scope).flatMap((path) => {
    const text = files.readText(path);
    return text.includes('\0') ? [] : [{ path, lines: text.split('\n') }];
  });
}

/**
 * No visible text file the scope owns holds text shaped like a credential, by
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
 * No visible text file the scope owns holds an IPv4 address literal, except loopback
 * (`127.0.0.0/8`), `0.0.0.0`, `255.255.255.255` and the documentation ranges `192.0.2.0/24`,
 * `198.51.100.0/24` and `203.0.113.0/24`; a file holding a NUL byte is binary and not read. The
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
