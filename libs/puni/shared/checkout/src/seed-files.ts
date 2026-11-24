import type { RepositoryType } from './registry';

/**
 * The entry files a new repository of each type starts with, by repository path, each a regular
 * file or a symlink: the only paths a {@link RepositoryType} checkout being created adds.
 */
export const seedFiles: Readonly<
  Record<RepositoryType, Readonly<Record<string, 'file' | 'symlink'>>>
> = {
  'system-state': {
    '.gitignore': 'file',
    'AGENTS.md': 'file',
    'CLAUDE.md': 'symlink',
    'README.md': 'file',
    'puni.json': 'file',
  },
  'system-records': { '.gitignore': 'file', 'AGENTS.md': 'file', 'CLAUDE.md': 'symlink' },
};
