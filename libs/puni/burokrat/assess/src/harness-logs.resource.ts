import { posix } from 'node:path';
import { describeCause } from '@puni/shared-failures';
import type { FileSystem } from '@puni/shared-ports';
import type { HarnessLogsResource, HarnessLogSources, LogLine } from './contract';
import { HarnessLogUnreadable } from './failures';
import { readInstant } from './period';
import { createUsageCollector } from './usage-collector';

/** What the harness logs resource needs from its host. */
export interface HarnessLogsRequirements {
  readonly fileSystem: FileSystem;
}

/**
 * The {@link HarnessLogsResource} of `fileSystem`. Claude Code's projects are
 * `~/.claude/projects`, Codex's sessions `~/.codex/sessions`, `~` the home directory. Every
 * `*.jsonl` file below a directory is a log, in name order, through subdirectories; a symlink is
 * not followed. A file last modified before the period holds no line of it and is not read, so
 * a period of days reads days of logs. Lines are read as they are taken, so a rollout larger
 * than memory is read too; how they are folded is {@link createUsageCollector}'s.
 */
export function createHarnessLogs({ fileSystem }: HarnessLogsRequirements): HarnessLogsResource {
  const home = fileSystem.homeDirectory();
  const unreadable = (path: string, cause: unknown) =>
    new HarnessLogUnreadable({ details: { path, reason: describeCause(cause) }, cause });
  const listLogs = (directory: string): string[] => {
    let kind;
    let entries;
    try {
      kind = fileSystem.stat(directory, 'follow');
      entries = kind === 'directory' ? fileSystem.list(directory) : [];
    } catch (cause) {
      throw unreadable(directory, cause);
    }
    if (kind !== 'directory') {
      const reason = kind === 'absent' ? 'nothing is there' : `it is a ${kind}, not a directory`;
      throw new HarnessLogUnreadable({ details: { path: directory, reason } });
    }
    return [...entries]
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap(({ name, kind }) => {
        const path = posix.join(directory, name);
        if (kind === 'directory') return listLogs(path);
        return kind === 'file' && name.endsWith('.jsonl') ? [path] : [];
      });
  };
  function* readLines(path: string): Generator<readonly [string, LogLine]> {
    let line = 0;
    let lines;
    try {
      lines = fileSystem.readLines(path)[Symbol.iterator]();
    } catch (cause) {
      throw unreadable(path, cause);
    }
    for (;;) {
      let next;
      try {
        next = lines.next();
      } catch (cause) {
        throw unreadable(path, cause);
      }
      if (next.done === true) return;
      line += 1;
      yield [next.value, { path, line }];
    }
  }
  return {
    defaultSources: {
      claudeProjects: [posix.join(home, '.claude', 'projects')],
      codexSessions: [posix.join(home, '.codex', 'sessions')],
    },
    read(sources: HarnessLogSources, period, repositorySlug) {
      const since = readInstant(period.since);
      const isFresh = (path: string): boolean => {
        try {
          return fileSystem.readModifiedTime(path).getTime() >= since;
        } catch (cause) {
          throw unreadable(path, cause);
        }
      };
      const collector = createUsageCollector(period, repositorySlug);
      for (const directory of sources.claudeProjects) {
        for (const path of listLogs(directory).filter(isFresh)) {
          for (const [raw, at] of readLines(path)) collector.readClaudeLine(raw, at);
        }
      }
      for (const directory of sources.codexSessions) {
        for (const path of listLogs(directory).filter(isFresh)) {
          const rollout = collector.startCodexRollout();
          for (const [raw, at] of readLines(path)) rollout.readLine(raw, at);
          rollout.finish();
        }
      }
      return collector.collect();
    },
  };
}
