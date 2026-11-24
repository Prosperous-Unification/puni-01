/** What a path names; `absent` when nothing is there. */
export type PathKind = 'file' | 'directory' | 'symlink' | 'other' | 'absent';

/** Whether a final symlink is followed when a path is described. */
export type LinkHandling = 'follow' | 'no-follow';

/** One entry of a directory, by name, never followed through a symlink. */
export interface DirectoryEntry {
  readonly name: string;
  readonly kind: Exclude<PathKind, 'absent'>;
}

/**
 * Raw synchronous access to the local file system, by absolute path. It decides nothing, but
 * every method that changes the file system throws, changing nothing, when given a relative
 * path, which would otherwise land wherever the process happens to run.
 */
export interface FileSystem {
  /**
   * The UTF-8 text of the file at `path`.
   *
   * @throws the runtime's error when the file cannot be read.
   */
  readText(path: string): string;
  /**
   * What `path` names. With `follow`, a symlink is described by its target and a dangling one
   * is `absent`. A missing path and a path below a file are `absent`; any other failure, such as
   * a symlink loop, a name too long or a directory that cannot be searched, throws.
   */
  stat(path: string, links: LinkHandling): PathKind;
  /**
   * Whether something exists at `path`, a symlink followed to its target. Never throws: a path
   * that cannot be described for any reason does not exist.
   */
  exists(path: string): boolean;
  /**
   * The lines of the text file at `path`, read as UTF-8 in pieces as they are taken, so a file
   * larger than memory can be read; each line without its `\n`, and a last line without one
   * included. An empty file has none.
   *
   * @throws the runtime's error, on the first line taken, when the file cannot be opened or read.
   */
  readLines(path: string): Iterable<string>;
  /**
   * When the file at `path`, a symlink followed, was last modified.
   *
   * @throws the runtime's error when nothing is there or it cannot be described.
   */
  readModifiedTime(path: string): Date;
  /** The absolute home directory of the user this process runs as. */
  homeDirectory(): string;
  /** The target text of the symlink at `path`. */
  readLink(path: string): string;
  /** The entries of the directory at `path`. */
  list(path: string): readonly DirectoryEntry[];
  /**
   * Writes `text` to the file at `path`, whose directory exists.
   *
   * @throws when `path` is not absolute.
   */
  write(path: string, text: string): void;
  /**
   * Atomically publishes a new file at `path`, whose directory exists.
   *
   * @throws the runtime's error, `EEXIST`, when anything is already at `path`.
   * @throws when `path` is not absolute.
   */
  writeNew(path: string, text: string): void;
  /**
   * Creates the directory at `path` and every missing parent.
   *
   * @throws when `path` is not absolute.
   */
  makeDirectory(path: string): void;
  /**
   * Creates a symlink at `path`, whose directory exists, holding the target text `target`.
   *
   * @throws the runtime's error, `EEXIST`, when anything is already at `path`.
   * @throws when `path` is not absolute; `target` may be relative, read from the link's directory.
   */
  makeLink(path: string, target: string): void;
}
