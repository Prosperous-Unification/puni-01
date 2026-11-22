/** What a path names; `absent` when nothing is there. */
export type PathKind = 'file' | 'directory' | 'symlink' | 'other' | 'absent';

/** Whether a final symlink is followed when a path is described. */
export type LinkHandling = 'follow' | 'no-follow';

/** One entry of a directory, by name, never followed through a symlink. */
export interface DirectoryEntry {
  readonly name: string;
  readonly kind: Exclude<PathKind, 'absent'>;
}

/** Raw synchronous access to the local file system, by absolute path. It decides nothing. */
export interface FileSystem {
  /**
   * The UTF-8 text of the file at `path`.
   *
   * @throws the runtime's error when the file cannot be read.
   */
  readText(path: string): string;
  /**
   * What `path` names. With `follow`, a symlink is described by its target and a dangling one
   * is `absent`; only a missing path is `absent`, any other failure throws.
   */
  stat(path: string, links: LinkHandling): PathKind;
  /** The target text of the symlink at `path`. */
  readLink(path: string): string;
  /** The entries of the directory at `path`. */
  list(path: string): readonly DirectoryEntry[];
  /** Writes `text` to the file at `path`, whose directory exists. */
  write(path: string, text: string): void;
  /** Removes the file or the whole directory at `path`. */
  remove(path: string): void;
  /** Creates the directory at `path` and every missing parent. */
  makeDirectory(path: string): void;
}
