import { afterEach } from 'bun:test';

/** What a test opens and must close: a container, or a host holding one. */
export interface Closable {
  close(): Promise<void>;
}

/**
 * Registers an `afterEach` that closes, newest first, everything the returned function was given
 * during the test, and returns that function, which hands back what it was given. Call it once at
 * the top level of a test file.
 */
export function closeAfterEach(): <Opened extends Closable>(opened: Opened) => Opened {
  const open: Closable[] = [];
  afterEach(async () => {
    for (const opened of open.splice(0).reverse()) await opened.close();
  });
  return (opened) => {
    open.push(opened);
    return opened;
  };
}
