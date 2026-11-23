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

/**
 * The private ranges, as each range's first address and prefix length: RFC 1918's `10/8`,
 * `172.16/12` and `192.168/16`, and RFC 6598's shared `100.64/10`, which tailnets address their
 * devices from.
 */
const privateRanges: readonly { readonly first: readonly number[]; readonly prefix: number }[] = [
  { first: [10, 0, 0, 0], prefix: 8 },
  { first: [172, 16, 0, 0], prefix: 12 },
  { first: [192, 168, 0, 0], prefix: 16 },
  { first: [100, 64, 0, 0], prefix: 10 },
];

/** The address `octets` as one unsigned 32-bit number. */
function toAddressNumber(octets: readonly number[]): number {
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

/** Whether the address `octets` lies in one of {@link privateRanges}. */
function isPrivateAddress(octets: readonly number[]): boolean {
  const address = toAddressNumber(octets);
  return privateRanges.some(({ first, prefix }) => {
    const size = 2 ** (32 - prefix);
    return Math.floor(address / size) === Math.floor(toAddressNumber(first) / size);
  });
}

/** Four dotted numbers, not inside a longer dotted run or a word. */
const dottedQuad = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\w|\.\d)/gu;

/**
 * Whether `line` holds an IPv4 address literal that may not be written down; a private one may
 * when `privateAllowed`.
 */
function holdsAddress(line: string, privateAllowed: boolean): boolean {
  return [...line.matchAll(dottedQuad)].some((match) => {
    const octets = match.slice(1, 5).map(Number);
    return (
      octets.every((octet) => octet <= 255) &&
      !isAllowedAddress(octets) &&
      !(privateAllowed && isPrivateAddress(octets))
    );
  });
}

/**
 * No visible text file the scope owns holds an IPv4 address literal, except loopback
 * (`127.0.0.0/8`), `0.0.0.0`, `255.255.255.255` and the documentation ranges `192.0.2.0/24`,
 * `198.51.100.0/24` and `203.0.113.0/24`, and a {@link privateRanges} address in a file whose
 * repository-relative path `allowsPrivate` accepts; a file holding a NUL byte is binary and not
 * read. The finding names the line, never the address. `remedy` says where the address belongs
 * instead.
 */
function forbidAddresses(remedy: string, allowsPrivate: (path: string) => boolean): Rule {
  return {
    id: 'secrets.addresses',
    remedy,
    judge({ files, scope }) {
      return listTextLines(files, scope).flatMap(({ path, lines }) => {
        const privateAllowed = allowsPrivate(path);
        return lines.flatMap((line, index): Breach[] =>
          holdsAddress(line, privateAllowed)
            ? [{ path, message: `line ${String(index + 1)} holds an IPv4 address` }]
            : [],
        );
      });
    },
  };
}

/** No address in a system-state repository, private or public, by `forbidAddresses`. */
export const forbidStateAddresses = forbidAddresses(
  "move a private address to the records repository's dash/ and a public one to the operator's SSH configuration, and name the host by its SSH alias; a test uses 192.0.2.0/24",
  () => false,
);

/**
 * No address in a records repository, by `forbidAddresses`, but a private one in a file under
 * `dash/`, which holds the state running the servers needs: `nav/` and `bur/` stay address-free,
 * and the operator's SSH configuration is the one place left for a public address.
 */
export const forbidRecordsAddresses = forbidAddresses(
  "write a private address only under dash/, move a public one to the operator's SSH configuration, and name the host by its SSH alias",
  (path) => path.startsWith('dash/'),
);
