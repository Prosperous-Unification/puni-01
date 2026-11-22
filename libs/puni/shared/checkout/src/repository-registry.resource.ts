import { dirname, join, resolve } from 'node:path';
import type { FileSystem, RepositoryRegistryResource } from './contract';
import { CheckoutMissing, RegistryMissing } from './failures';
import { nameRepository, parseRegistry } from './registry';
import { readOrRefuse } from './unreadable';

/** The {@link RepositoryRegistryResource} over `fileSystem`. */
export function createRepositoryRegistry({
  fileSystem,
}: {
  fileSystem: FileSystem;
}): RepositoryRegistryResource {
  return {
    locate(cwd) {
      let directory = resolve(cwd);
      for (;;) {
        const file = join(directory, 'puni.json');
        if (fileSystem.stat(file, 'no-follow') === 'file') {
          const text = readOrRefuse(file, () => fileSystem.readText(file));
          const registry = parseRegistry(text, file);
          return { root: directory, type: registry.thisType, registry };
        }
        const parent = dirname(directory);
        if (parent === directory) {
          throw new RegistryMissing({ details: { rule: 'repository.root', path: '.', cwd } });
        }
        directory = parent;
      }
    },
    resolve(found, type) {
      if (type === found.type) return found;
      const entry = found.registry.repos[type];
      const root = join(dirname(found.root), nameRepository(entry));
      if (fileSystem.stat(root, 'no-follow') !== 'directory') {
        throw new CheckoutMissing({
          details: { rule: 'repository.checkout', path: '.', type, root, url: entry.remote.url },
        });
      }
      return { root, type, registry: found.registry };
    },
  };
}
